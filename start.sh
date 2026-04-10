#!/bin/sh
echo "Starting on port: $PORT"
exec gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120
