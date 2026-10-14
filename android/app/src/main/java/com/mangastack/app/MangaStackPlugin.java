package com.mangastack.app;

import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
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

/**
 * 内置更新器的原生支撑：把 Release APK 流式下载到应用私有目录
 * files/updates（无需存储权限，卸载即清除），再通过 FileProvider
 * 交给系统安装器。JS 侧契约见 src/lib/native.ts。
 */
@CapacitorPlugin(name = "MangaStack")
public class MangaStackPlugin extends Plugin {

    private File updatesDir() {
        File dir = new File(getContext().getFilesDir(), "updates");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private boolean badName(String name) {
        return name == null || name.contains("/") || name.contains("..");
    }

    @PluginMethod
    public void downloadApk(PluginCall call) {
        final String url = call.getString("url");
        final String name = call.getString("name");
        if (url == null || badName(name)) {
            call.reject("invalid params");
            return;
        }
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                File tmp = new File(updatesDir(), name + ".part");
                File out = new File(updatesDir(), name);
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("User-Agent", "MangaStack-Updater");
                conn.connect();
                int code = conn.getResponseCode();
                if (code >= 400) {
                    call.reject("http " + code);
                    return;
                }
                long total = conn.getContentLengthLong();
                try (InputStream in = conn.getInputStream(); FileOutputStream fos = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[64 * 1024];
                    long received = 0;
                    int n;
                    long lastNotify = 0;
                    while ((n = in.read(buf)) != -1) {
                        fos.write(buf, 0, n);
                        received += n;
                        long now = System.currentTimeMillis();
                        if (now - lastNotify > 200) {
                            lastNotify = now;
                            JSObject p = new JSObject();
                            p.put("name", name);
                            p.put("received", received);
                            p.put("total", total);
                            notifyListeners("downloadProgress", p);
                        }
                    }
                }
                if (!tmp.renameTo(out)) {
                    call.reject("rename failed");
                    return;
                }
                JSObject ret = new JSObject();
                ret.put("name", name);
                ret.put("size", out.length());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("download failed: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String name = call.getString("name");
        if (badName(name)) {
            call.reject("invalid name");
            return;
        }
        File f = new File(updatesDir(), name);
        if (!f.exists()) {
            call.reject("file not found");
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                f
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("install failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void listApks(PluginCall call) {
        JSArray arr = new JSArray();
        File[] files = updatesDir().listFiles((d, n) -> n.endsWith(".apk"));
        if (files != null) {
            for (File f : files) {
                JSObject o = new JSObject();
                o.put("name", f.getName());
                o.put("size", f.length());
                o.put("at", f.lastModified());
                arr.put(o);
            }
        }
        JSObject ret = new JSObject();
        ret.put("files", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void deleteApk(PluginCall call) {
        String name = call.getString("name");
        if (!badName(name)) {
            File f = new File(updatesDir(), name);
            if (f.exists()) f.delete();
        }
        call.resolve();
    }

    @PluginMethod
    public void clearApks(PluginCall call) {
        File[] files = updatesDir().listFiles();
        if (files != null) for (File f : files) f.delete();
        call.resolve();
    }
}
