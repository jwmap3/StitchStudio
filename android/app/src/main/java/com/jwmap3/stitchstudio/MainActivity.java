package com.jwmap3.stitchstudio;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final int PICK_FILE = 41;
    private static final int PERM_STORAGE = 42;
    private WebView web;
    private ValueCallback<Uri[]> pending;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#1F2229"));
        w.setNavigationBarColor(Color.parseColor("#1F2229"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#16181D"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setBuiltInZoomControls(false);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(true);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pending != null) pending.onReceiveValue(null);
                pending = callback;
                Intent i;
                try {
                    i = params.createIntent();
                } catch (Exception e) {
                    i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.setType("*/*");
                }
                i.addCategory(Intent.CATEGORY_OPENABLE);
                try {
                    startActivityForResult(Intent.createChooser(i, "Choose a file"), PICK_FILE);
                } catch (Exception e) {
                    pending.onReceiveValue(null);
                    pending = null;
                    return false;
                }
                return true;
            }
        });

        if (Build.VERSION.SDK_INT < 29 &&
                checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, PERM_STORAGE);
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FILE || pending == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getData() != null) result = new Uri[]{data.getData()};
            else if (data.getClipData() != null && data.getClipData().getItemCount() > 0)
                result = new Uri[]{data.getClipData().getItemAt(0).getUri()};
        }
        pending.onReceiveValue(result);
        pending = null;
    }

    @Override
    public void onBackPressed() {
        // the editor keeps all work in the page; ask before leaving
        new android.app.AlertDialog.Builder(this)
                .setMessage("Close Stitch Studio? Your design is kept for next time.")
                .setPositiveButton("Close", (d, i) -> finish())
                .setNegativeButton("Stay", null)
                .show();
    }

    /** Called from JavaScript: window.AndroidBridge.saveFile(name, base64, mime) -> true/false */
    private class Bridge {
        @JavascriptInterface
        public boolean saveFile(String name, String base64, String mime) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentResolver cr = getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/StitchStudio");
                    Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) return false;
                    try (OutputStream os = cr.openOutputStream(uri)) {
                        if (os == null) return false;
                        os.write(bytes);
                    }
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "StitchStudio");
                    if (!dir.exists() && !dir.mkdirs()) return false;
                    File f = new File(dir, name);
                    try (FileOutputStream os = new FileOutputStream(f)) {
                        os.write(bytes);
                    }
                }
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }
}
