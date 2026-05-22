#!/bin/bash
# ALGOTRADE Android Release Build Script

# 1. Build the web app
npm run build

# 2. Sync to Capacitor
npx cap sync android

# 3. Build Android release profile
echo "Building APK using gradle..."
cd android
./gradlew assembleRelease

echo "Build complete."
echo "Your unsigned APK is located at: android/app/build/outputs/apk/release/app-release-unsigned.apk"
echo ""
echo "To sign for Google Play:"
echo "1. Create a Keystore: keytool -genkey -v -keystore release.keystore -alias my-alias -keyalg RSA -keysize 2048 -validity 10000"
echo "2. Sign the APK: apksigner sign --ks release.keystore --out app-release.apk android/app/build/outputs/apk/release/app-release-unsigned.apk"
