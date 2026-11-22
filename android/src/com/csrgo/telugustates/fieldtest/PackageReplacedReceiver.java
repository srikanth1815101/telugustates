package com.csrgo.telugustates.fieldtest;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import java.io.File;

/** Automatically restarts AtlasActivity as soon as an in-app APK update finishes replacing the package. */
public final class PackageReplacedReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) {
            return;
        }
        File staged = new File(new File(context.getCacheDir(), "updates"), "Telugu-States-Update.apk");
        //noinspection ResultOfMethodCallIgnored
        staged.delete();

        SharedPreferences sp = context.getSharedPreferences(ApkUpdater.PREFS, Context.MODE_PRIVATE);
        long deadline = sp.getLong(ApkUpdater.KEY_RELAUNCH_DEADLINE, 0L);
        if (deadline > System.currentTimeMillis()) {
            ApkUpdater.relaunchApp(context);
        }
    }
}
