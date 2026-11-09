#!/usr/bin/env bash
# Adds the in-app updater (native plugin) to the generated Capacitor Android project.
set -e
APPID=$(node -e "console.log(require('./capacitor.config.json').appId)")
PKGDIR="android/app/src/main/java/$(echo "$APPID" | tr . /)"
MANIFEST=android/app/src/main/AndroidManifest.xml
mkdir -p "$PKGDIR"

sed "s/__PACKAGE__/$APPID/" native/ApkInstallerPlugin.java > "$PKGDIR/ApkInstallerPlugin.java"

cat > "$PKGDIR/MainActivity.java" <<JAVA
package $APPID;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
JAVA

if ! grep -q REQUEST_INSTALL_PACKAGES "$MANIFEST"; then
  sed -i 's#<application#<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n    <application#' "$MANIFEST"
fi

cat >> android/app/proguard-rules.pro <<RULES

# keep the in-app updater plugin (called through reflection by Capacitor)
-keep class $APPID.ApkInstallerPlugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { @com.getcapacitor.PluginMethod public <methods>; }
RULES
echo "Updater plugin installed for $APPID"
