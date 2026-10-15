package com.mangastack.app;

import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.Display;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Android 15（targetSdk 35）起强制 edge-to-edge：WebView 画到状态栏与手势条
    // 下面，而 Android WebView 的 env(safe-area-inset-*) 只覆盖刘海、不覆盖系统栏。
    // 这里把「WebView 与系统栏的真实重叠区域」提供给 Web 侧（CSS 变量
    // --safe-top/right/bottom/left，Web 侧取 max(env(...), var(...))）。
    //
    // 不能直接透传监听器收到的 insets：部分系统（如 MuMu 的 Android 12）即使
    // WebView 没有越界也会下发原始值，直接透传会造成双重留白。因此先缓存
    // 原始 insets，再结合 WebView 在屏幕上的几何位置求真实重叠。
    private final int[] rawBars = new int[4]; // top right bottom left
    private int safeTop = 0, safeRight = 0, safeBottom = 0, safeLeft = 0;
    private WebView appWebView;

    /** Web 侧拉取安全区的桥接对象；addJavascriptInterface 跨页面导航存活，
        避免推送时机早于 SPA 页面加载、被导航冲掉的问题。 */
    private class SafeInsetsBridge {
        @JavascriptInterface
        public int top() { return safeTop; }

        @JavascriptInterface
        public int right() { return safeRight; }

        @JavascriptInterface
        public int bottom() { return safeBottom; }

        @JavascriptInterface
        public int left() { return safeLeft; }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 自有插件须在桥接初始化前注册
        registerPlugin(MangaStackPlugin.class);
        super.onCreate(savedInstanceState);

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        appWebView = webView;

        webView.addJavascriptInterface(new SafeInsetsBridge(), "MangaStackInsets");

        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            rawBars[0] = bars.top;
            rawBars[1] = bars.right;
            rawBars[2] = bars.bottom;
            rawBars[3] = bars.left;
            // 键盘避让（借鉴 zcode-shell 的做法）：edge-to-edge 环境（Android 15 或
            // 卓易通等兼容层）里 windowSoftInputMode=adjustResize 失效，窗口不随输入法
            // 收缩，WebView 的 interactive-widget/visualViewport 也不可靠。这里把 IME
            // insets 直接作为 WebView 的 bottom padding——视图物理收缩，布局视口必然
            // 跟着缩，Web 侧底部弹层自然抬到键盘上方。普通设备上 IME insets 已被消费
            // 为 0，此操作为空操作。
            int imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            v.setPadding(0, 0, 0, imeBottom);
            // 等本次遍历的布局完成后计算几何重叠
            webView.post(MainActivity.this::pushOverlaps);
            return insets;
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // 旋转、分屏等布局重排后再算一次
        if (hasFocus) pushOverlaps();
    }

    private void pushOverlaps() {
        WebView webView = appWebView;
        if (webView == null || webView.getWidth() == 0 || webView.getHeight() == 0) return;

        int[] loc = new int[2];
        webView.getLocationOnScreen(loc);
        DisplayMetrics dm = new DisplayMetrics();
        Display display = getWindowManager().getDefaultDisplay();
        display.getRealMetrics(dm);

        // 几何重叠算出的是物理像素，而 CSS 变量以 CSS 像素为单位——必须除以
        // density 换算，否则在高密度屏（如 480dpi、缩放 3x）上补偿会被放大数倍，
        // 底部导航/阅读器出现大片悬空
        float scale = getResources().getDisplayMetrics().density;

        // 底部计算用内容盒（视图高减去 IME padding），键盘弹出时 webview 被 padding
        // 抬起，系统栏重叠不应把 IME 高度误算进去
        int contentBottom = loc[1] + webView.getHeight() - webView.getPaddingBottom();
        safeTop = Math.round(Math.max(0, rawBars[0] - loc[1]) / scale);
        safeLeft = Math.round(Math.max(0, rawBars[3] - loc[0]) / scale);
        safeRight = Math.round(Math.max(0, rawBars[1] - (dm.widthPixels - (loc[0] + webView.getWidth()))) / scale);
        safeBottom = Math.round(Math.max(0, rawBars[2] - (dm.heightPixels - contentBottom)) / scale);

        String js = String.format(
                "window.__setSafeInsets && window.__setSafeInsets(%d,%d,%d,%d);",
                safeTop, safeRight, safeBottom, safeLeft);
        webView.evaluateJavascript(js, null);
    }
}
