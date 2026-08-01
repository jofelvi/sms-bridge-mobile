@echo off
cd /d C:\Users\jofel\RepositoriosPersonales\sms-bridge-mobile\android
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
call gradlew.bat assembleRelease --console=plain
