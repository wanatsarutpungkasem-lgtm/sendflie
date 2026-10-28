#!/bin/zsh
cd -- "${0:A:h}" || exit 1
print 'Sendfile: http://localhost:5184/?mode=live'
print 'Keep this Terminal window open while using Sendfile. Press Control+C to stop.'
exec python3 -m http.server 5184 --bind 127.0.0.1 --directory dist
