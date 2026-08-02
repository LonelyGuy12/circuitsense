#!/usr/bin/env bash
# exit on error
set -o errexit

echo "=== Building Frontend ==="
cd frontend
npm install
npm run build
cd ..

echo "=== Preparing Static Files for Backend ==="
rm -rf backend/static
cp -r frontend/dist backend/static

echo "=== Installing Backend Dependencies ==="
cd backend
pip install -r requirements.txt

echo "=== Build Complete ==="
