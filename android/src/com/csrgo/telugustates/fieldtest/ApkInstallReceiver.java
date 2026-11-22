package com.csrgo.telugustates.fieldtest;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Receives PackageInstaller session callbacks and presents confirmation inside the app flow. */
public final class ApkInstallReceiver extends BroadcastReceiver {
    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ApkUpdater.ACTION_INSTALL_STATUS.equals(intent.getAction())) {
            return;
        }
        ApkUpdater updater = ApkUpdater.get(context);
        int status = intent.getIntExtra(
                PackageInstaller.EXTRA_STATUS,
                PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            updater.onInstallPendingConfirmation();
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                AtlasActivity act = AtlasActivity.currentActivity();
                try {
                    if (act != null && !act.isFinishing()) {
                        act.startActivity(confirm);
                    } else {
                        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        context.startActivity(confirm);
                    }
                } catch (RuntimeException e) {
                    updater.onInstallFailure(status, e.getMessage());
                }
            }
            return;
        }
        if (status == PackageInstaller.STATUS_SUCCESS) {
            updater.onInstallSuccess();
            return;
        }
        String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        updater.onInstallFailure(status, msg);
    }
}
