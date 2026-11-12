package com.kelani.sbdtracker;

import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DistributionChannel")
public class DistributionChannelPlugin extends Plugin {
    @PluginMethod
    @SuppressWarnings("deprecation")
    public void getChannel(PluginCall call) {
        try {
            PackageManager manager = getContext().getPackageManager();
            String ownPackage = getContext().getPackageName();
            String installer = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? manager.getInstallSourceInfo(ownPackage).getInstallingPackageName()
                : manager.getInstallerPackageName(ownPackage);
            JSObject result = new JSObject();
            // A null installer is a successful lookup of a direct/sideloaded app.
            // Lookup failures are rejected, never interpreted as sideloads.
            result.put("channel", "com.android.vending".equals(installer) ? "play" : "direct");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not determine this app's installation source", error);
        }
    }
}
