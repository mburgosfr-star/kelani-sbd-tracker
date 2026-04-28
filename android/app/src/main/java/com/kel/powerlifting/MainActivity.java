package com.kel.powerlifting;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.io.File;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    deleteWebViewServiceWorkerData();

    super.onCreate(savedInstanceState);

    WebView webView = getBridge().getWebView();

    if (webView != null) {
      webView.clearCache(true);
      webView.clearHistory();

      WebSettings settings = webView.getSettings();
      settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
      settings.setDomStorageEnabled(true);
    }
  }

  private void deleteWebViewServiceWorkerData() {
    File dataDir = getDataDir();

    deleteDir(new File(dataDir, "app_webview/Default/Service Worker"));
    deleteDir(new File(dataDir, "app_webview/Default/Cache"));
    deleteDir(new File(dataDir, "app_webview/Default/Code Cache"));
    deleteDir(new File(dataDir, "app_webview/Default/GPUCache"));
    deleteDir(new File(dataDir, "app_webview/Default/Session Storage"));
    deleteDir(new File(dataDir, "app_webview/Default/IndexedDB"));

    deleteDir(new File(getCacheDir(), "WebView"));
    deleteDir(new File(getCodeCacheDir(), "WebView"));
  }

  private boolean deleteDir(File dir) {
    if (dir == null || !dir.exists()) return true;

    File[] files = dir.listFiles();
    if (files != null) {
      for (File file : files) {
        if (file.isDirectory()) {
          deleteDir(file);
        } else {
          file.delete();
        }
      }
    }

    return dir.delete();
  }
}