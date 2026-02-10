import os
from pathlib import Path

import keyring
import webview

from backend import AudioAPI


def main():
    api = AudioAPI()

    # Check for API key in keyring
    api_key_available = keyring.get_password("SayClip", "openai_api_key") is not None

    if os.getenv("SHOW_SETUP") == "1" or not api_key_available:
        setup_page_frontend = str((Path(__file__).parent / "frontend" / "setup" / "index.html").resolve())
        window = webview.create_window(
            'Setup',
            setup_page_frontend,
            width=400,
            height=280,
            js_api=api
        )
    else:
        main_page_frontend = str((Path(__file__).parent / "frontend" / "main" / "index.html").resolve())
        window = webview.create_window(
            'SayClip',
            main_page_frontend,
            js_api=api,
            width=500,
            height=50,
            resizable=False,
            on_top=True,
        )

    # Store window reference in the API instance
    api.window = window

    webview.start(
        gui='qt',
        icon="icon.ico",
        debug=os.getenv("ENABLE_DEBUG", "0") == "1"
    )


if __name__ == '__main__':
    main()