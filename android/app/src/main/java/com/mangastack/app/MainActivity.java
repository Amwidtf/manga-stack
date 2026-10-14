package com.mangastack.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 自有插件须在桥接初始化前注册
        registerPlugin(MangaStackPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
