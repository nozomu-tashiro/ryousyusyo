#!/bin/sh
APP_PORT=${PORT:-8080}
echo "Starting gunicorn on port: $APP_PORT"
exec gunicorn app:app --bind "0.0.0.0:$APP_PORT" --workers 1 --timeout 120
