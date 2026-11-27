package com.kelani.sbdtracker;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;

@CapacitorPlugin(name = "BackupDocument")
public class BackupDocumentPlugin extends Plugin {
    private volatile Uri lastSavedBackup;

    @PluginMethod
    public void share(PluginCall call) {
        Uri file = lastSavedBackup;
        if (file == null) {
            call.reject("Save a backup before sharing it");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_STREAM, file);
        intent.setClipData(ClipData.newRawUri("Backup", file));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(Intent.createChooser(intent, call.getString("title")));
                call.resolve();
            } catch (Exception error) {
                call.reject("Could not share the saved backup", error);
            }
        });
    }

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename", "");
        File source = getStagedBackup(call);
        if (!filename.matches("kelani-sbd-tracker-backup-\\d{4}-\\d{2}-\\d{2}-\\d{4}\\.json")
            || source == null || !source.isFile()) {
            call.reject("Invalid staged backup");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "saveResult");
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            call.resolve(new JSObject().put("saved", false));
            return;
        }

        Uri destination = result.getData() == null ? null : result.getData().getData();
        File source = getStagedBackup(call);
        if (result.getResultCode() != Activity.RESULT_OK || destination == null || source == null) {
            call.reject("No backup destination was selected");
            return;
        }

        getBridge().execute(() -> saveVerifiedDocument(call, source, destination));
    }

    private File getStagedBackup(PluginCall call) {
        String stagedName = call.getString("stagedName", "");
        if (!stagedName.matches("kelani-export-[0-9a-f-]{36}\\.json")) return null;
        return new File(getContext().getCacheDir(), stagedName);
    }

    private void saveVerifiedDocument(PluginCall call, File source, Uri destination) {
        ContentResolver resolver = getContext().getContentResolver();
        try {
            MessageDigest expected = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[64 * 1024];
            try (InputStream input = new FileInputStream(source);
                 OutputStream output = resolver.openOutputStream(destination, "wt")) {
                if (output == null) throw new IOException("Cannot open backup destination");
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    expected.update(buffer, 0, read);
                }
            }

            MessageDigest actual = MessageDigest.getInstance("SHA-256");
            try (InputStream input = resolver.openInputStream(destination)) {
                if (input == null) throw new IOException("Cannot verify saved backup");
                int read;
                while ((read = input.read(buffer)) != -1) {
                    actual.update(buffer, 0, read);
                }
            }
            if (!MessageDigest.isEqual(expected.digest(), actual.digest())) {
                throw new IOException("Saved backup verification failed");
            }
            lastSavedBackup = destination;
            call.resolve(new JSObject().put("saved", true));
        } catch (Exception error) {
            try {
                DocumentsContract.deleteDocument(resolver, destination);
            } catch (Exception cleanupError) {
                error.addSuppressed(cleanupError);
            }
            call.reject("Could not save and verify the backup", error);
        }
    }
}
