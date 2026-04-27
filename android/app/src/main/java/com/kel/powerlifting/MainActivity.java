package com.kel.powerlifting;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WebView webView = getBridge().getWebView();
    webView.clearCache(true);
    webView.getSettings().setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE);
  }
}
