import threading
import webbrowser

import uvicorn
from dotenv import load_dotenv


def main() -> None:
    load_dotenv()
    url = "http://127.0.0.1:8420"
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    uvicorn.run("agent_workforce.server:app", host="127.0.0.1", port=8420)
