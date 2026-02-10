import base64
import copy
import datetime
import json
import os
import sys
from io import BytesIO
from pathlib import Path
from warnings import filterwarnings

import keyring
import webview
from copykitten import copy as ck_copy
from dotenv import load_dotenv
from webview import Window

# Had to add this one, because of httpx deprecation warning in httpx (URL.raw derprecation).
# Remind me to remove this once openai will update their httpx dependency...
filterwarnings("ignore", category=UserWarning, message=".*URL.raw is deprecated.*")
from openai import APIConnectionError, AuthenticationError, OpenAI


class AudioAPI:
    CONFIG_PATH: str = str((Path(__file__).parent.parent / "config.json").resolve())
    ALLOWED_MODELS: set[str] = {
        "gpt-4o-transcribe",
        "gpt-4o-mini-transcribe",
        "gpt-4o-mini-transcribe-2025-12-15",
        "whisper-1",
        "gpt-4o-transcribe-diarize",
    }
    DEFAULT_CONFIG = {
        "openai": {
            "model": "gpt-4o-mini-transcribe",
            "prompt": "Transcribe accurately with proper punctuation and capitalization, remove filler words.",
            "temperature": 0,
        }
    }

    def __init__(self):
        load_dotenv()
        self.config = self.load_config()
        self.apply_config(self.config)

        # Try to get key from keyring first, then environment variable
        self.api_key = keyring.get_password("SayClip", "openai_api_key") or os.getenv(
            "OPENAI_API_KEY"
        )

        if self.api_key:
            self.client = OpenAI(api_key=self.api_key)
        else:
            self.client = None

        self.window: Window | None = None
        self.settings_window: Window | None = None

        self.model: str = ""
        self.prompt: str = ""
        self.temperature: float = 0.0

    def validate_and_save_key(self, api_key):
        """Validates the API key and saves it to keyring if valid"""
        if not api_key:
            return {"success": False, "error": "API key cannot be empty"}

        try:
            # Validate by creating a temporary client and listing models
            client = OpenAI(api_key=api_key)
            client.models.list()

            # If successful, save to keyring
            keyring.set_password("SayClip", "openai_api_key", api_key)

            # Restart application
            self.restart_app()
            return {"success": True} # Won't be reacheable?
            # TODO: delete later, or put before restart
        except AuthenticationError:
            return {
                "success": False,
                "error": "Incorrect API key provided. Please check your key.",
            }
        except APIConnectionError:
            return {
                "success": False,
                "error": "Connection error. Please check your internet connection.",
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def restart_app(self):
        """Restarts the application"""
        if self.window:
            self.window.destroy()

        os.execl(sys.executable, sys.executable, *sys.argv)

    def apply_config(self, config):
        openai_config = config.setdefault("openai", {})
        defaults = self.DEFAULT_CONFIG["openai"]
        self.model = openai_config.get("model", defaults["model"])
        self.prompt = openai_config.get("prompt", defaults["prompt"])
        self.temperature = openai_config.get("temperature", defaults["temperature"])

    @classmethod
    def load_config(cls):
        config_path = cls.CONFIG_PATH
        try:
            with open(config_path, encoding="utf-8") as f:
                data = json.load(f)
                if not isinstance(data, dict):
                    raise ValueError("config.json must contain a JSON object")
                return data
        except FileNotFoundError:
            print(f"Warning: config.json not found at {config_path}, using defaults")
        except ValueError as error:
            print(f"Warning: Failed to parse config.json ({error}), using defaults")
        return copy.deepcopy(cls.DEFAULT_CONFIG)

    def save_config(self):
        try:
            with open(self.CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(self.config, f, indent=4)
        except OSError as error:
            raise RuntimeError(f"Unable to write config file: {error}")

    def get_settings(self):
        return {
            "model": self.model,
            "temperature": self.temperature,
            "initialPrompt": self.prompt,
        }

    def update_settings(self, new_settings: dict):
        try:
            temperature = float(new_settings.get("temperature", self.temperature))
        except (TypeError, ValueError):
            return {"success": False, "error": "Temperature must be a number"}
        temperature = max(0.0, min(1.0, temperature))

        model = new_settings.get("model", self.model)
        if model not in self.ALLOWED_MODELS:
            return {"success": False, "error": "Model is not supported"}

        prompt = new_settings.get("initialPrompt")
        if prompt is None:
            prompt = new_settings.get("prompt", self.prompt)
        prompt = str(prompt)

        openai_config = self.config.setdefault("openai", {})
        openai_config.update(
            {
                "model": model,
                "temperature": temperature,
                "prompt": prompt,
            }
        )

        try:
            self.save_config()
        except RuntimeError as error:
            return {"success": False, "error": str(error)}

        self.apply_config(self.config)
        return {"success": True, "settings": self.get_settings()}

    def process_audio(self, audio_base64):
        """Transcribe base64 encoded WebM audio data"""
        if not self.client:
            return {
                "success": False,
                "stage": "error",
                "message": "Error: OpenAI API key not configured.",
                "copied": False,
            }

        try:
            audio_data = base64.b64decode(audio_base64)
            audio_file = BytesIO(audio_data)
            audio_file.name = (
                f"recording_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.webm"
            )

            transcription = self.client.audio.transcriptions.create(
                model=self.model,
                file=audio_file,
                prompt=self.prompt,
                temperature=self.temperature,
            )

            text = transcription.text.strip()
            print(text)
            copied = False
            try:
                ck_copy(text)
                copied = True
            except Exception as copy_error:
                print(f"Clipboard copy failed: {copy_error}")
            return {
                "success": True,
                "stage": "done",
                "message": "Transcription complete",
                "text": text,
                "copied": copied,
            }
        except Exception as e:
            error_message = str(e)
            print(f"Error transcribing audio: {error_message}")
            return {
                "success": False,
                "stage": "error",
                "message": error_message,
                "copied": False,
            }

    def close_window(self):
        """Close the application window"""
        if self.window:
            self.window.destroy()

    def open_settings(self):
        """Open the settings window"""
        # If settings window already exists, do nothing
        if self.settings_window is not None:
            return

        settings_page = str(
            (
                Path(__file__).parent.parent / "frontend" / "settings" / "index.html"
            ).as_uri()
        )
        # This method causes lots of UI glitches, so possibly
        # TODO: rewrite to use another bottle instance or any other html serving method
        self.settings_window = webview.create_window(
            "SayClip Settings", settings_page, width=400, height=500, js_api=self
        )

        if self.settings_window is not None:
            # Clear the reference when the window is closed
            def on_settings_closed():
                self.settings_window = None

            self.settings_window.events.closed += on_settings_closed

