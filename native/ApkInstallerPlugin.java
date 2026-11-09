package __PACKAGE__;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * In-app updater: downloads the new APK, checks it belongs to this app and is newer,
 * then opens the system installer (same signature => installs over the old app, data is kept).
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {
    private volatile boolean busy = false;

    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean ok = Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject r = new JSObject();
        r.put("allowed", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Cannot open settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        final String sha = call.getString("sha256");
        if (url == null || !url.startsWith("https://")) { call.reject("Invalid download link"); return; }
        if (busy) { call.reject("A download is already running"); return; }
        busy = true;
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    File apk = download(url);
                    if (sha != null && sha.length() > 10) {
                        String got = sha256(apk);
                        if (!got.equalsIgnoreCase(sha.trim())) { apk.delete(); throw new Exception("Checksum mismatch - download was corrupted"); }
                    }
                    verify(apk);
                    install(apk);
                    JSObject r = new JSObject();
                    r.put("started", true);
                    call.resolve(r);
                } catch (Exception e) {
                    call.reject(e.getMessage() == null ? "Update failed" : e.getMessage());
                } finally {
                    busy = false;
                }
            }
        }).start();
    }

    private File download(String link) throws Exception {
        File out = new File(getContext().getCacheDir(), "update.apk");
        if (out.exists()) out.delete();
        HttpURLConnection c = (HttpURLConnection) new URL(link).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(true);
        c.connect();
        if (c.getResponseCode() != 200) throw new Exception("Server returned " + c.getResponseCode());
        long total = c.getContentLengthLong();
        InputStream in = c.getInputStream();
        FileOutputStream fo = new FileOutputStream(out);
        byte[] buf = new byte[32768];
        long done = 0; int last = -1; int n;
        while ((n = in.read(buf)) > 0) {
            fo.write(buf, 0, n);
            done += n;
            if (total > 0) {
                int p = (int) (done * 100 / total);
                if (p != last) { last = p; JSObject o = new JSObject(); o.put("percent", p); o.put("downloaded", done); o.put("total", total); notifyListeners("progress", o); }
            }
        }
        fo.close(); in.close(); c.disconnect();
        if (out.length() < 100000) throw new Exception("Downloaded file is too small to be the app");
        return out;
    }

    private String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        InputStream in = new java.io.FileInputStream(f);
        byte[] buf = new byte[65536]; int n;
        while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        in.close();
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    @SuppressWarnings("deprecation")
    private void verify(File apk) throws Exception {
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        PackageInfo info = pm.getPackageArchiveInfo(apk.getAbsolutePath(), 0);
        if (info == null || !ctx.getPackageName().equals(info.packageName)) throw new Exception("This file is not an Amazing PDF update");
        PackageInfo cur = pm.getPackageInfo(ctx.getPackageName(), 0);
        long newCode = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
        long curCode = Build.VERSION.SDK_INT >= 28 ? cur.getLongVersionCode() : cur.versionCode;
        if (newCode <= curCode) throw new Exception("You already have the latest version");
    }

    private void install(final File apk) {
        final Context ctx = getContext();
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
            }
        });
    }
}
