# Signing the Android app for release (SECURITY_PLAN S0.3)

The Play Store knows Sahla by the key that signs its uploads. Until now release builds were signed with the
public **debug** key, which anyone has. `frontend/android/app/build.gradle` now uses **Sahla's own upload key**
when it is set up on the computer, and `bundleRelease` (the file you upload to Google Play) refuses to run
without it. The key and its passwords are never in git.

## 1. Make the upload key (once, on the owner's computer)

In PowerShell (Android Studio's JDK has `keytool`):

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v `
  -keystore "$env:USERPROFILE\sahla-upload.jks" -alias sahla-upload `
  -keyalg RSA -keysize 4096 -validity 10000
```

It asks for a password (choose a long one and save it in a password manager) and a name / organisation.

## 2. Tell Gradle where it is (outside the project)

Create or edit `%USERPROFILE%\.gradle\gradle.properties` (not the project's `gradle.properties`):

```properties
SAHLA_UPLOAD_STORE_FILE=C:/Users/<you>/sahla-upload.jks
SAHLA_UPLOAD_KEY_ALIAS=sahla-upload
SAHLA_UPLOAD_STORE_PASSWORD=<the password>
SAHLA_UPLOAD_KEY_PASSWORD=<the password>
```

## 3. Keep it safe

* Back up `sahla-upload.jks` and the password **offline** (e.g. an encrypted USB stick) and in the password
  manager. Never email it, never commit it, never paste the password in a chat.
* In Google Play Console turn on **Play App Signing** (Google keeps the real app key; a lost upload key can be
  reset there).

## 4. Google sign-in and Firebase

Add the upload key's **SHA-1 and SHA-256** (and, after the first upload, the **Play App Signing** key's from
Play Console → App integrity) to Firebase project `sahla-project-75cb2` → Android app. Without them Google
sign-in fails in release builds:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -list -v -keystore "$env:USERPROFILE\sahla-upload.jks" -alias sahla-upload
```

## 5. Check

```powershell
cd frontend\android
.\gradlew.bat bundleRelease
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -printcert -jarfile app\build\outputs\bundle\release\app-release.aab
```

The certificate shown must be yours, not `CN=Android Debug`.
