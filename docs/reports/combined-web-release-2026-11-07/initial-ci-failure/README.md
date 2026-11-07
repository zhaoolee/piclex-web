First candidate CI: https://github.com/zhaoolee/piclex-web/actions/runs/42382026203

All 3 raw CI job logs are retained. The subscription/listening screenshots and traces come from the matching failures reproduced in the native local Linux Chromium container; downloading the complete 307 MB GitHub artifact ended in an unexpected EOF. The original CI artifacts remain attached to the run.

9 CI failures: 4 desktop + 4 mobile (startup speech-service error obscures the download entry and carries into passive listening), and 1 WebKit fixture that did not establish the new first-load audio state. No Pages or Docker deployment occurred.
