package br.com.mude.cabine;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.print.PrintHelper;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(
    name = "Cabine",
    permissions = { @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage") }
)
public class CabinePlugin extends Plugin {

    static final String AUTHOR = "Joelson Sampaio <joelsonsam@gmail.com>";

    @PluginMethod
    public void print(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("Imagem ausente");
            return;
        }
        boolean landscape = Boolean.TRUE.equals(call.getBoolean("landscape", false));
        String jobName = call.getString("jobName", "Cabine Mude");
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
        if (bitmap == null) {
            call.reject("Imagem inválida");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                PrintHelper helper = new PrintHelper(getActivity());
                helper.setScaleMode(PrintHelper.SCALE_MODE_FILL);
                helper.setColorMode(PrintHelper.COLOR_MODE_COLOR);
                helper.setOrientation(landscape ? PrintHelper.ORIENTATION_LANDSCAPE : PrintHelper.ORIENTATION_PORTRAIT);
                helper.printBitmap(jobName, bitmap);
                JSObject ret = new JSObject();
                ret.put("started", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Falha ao abrir a impressão: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void saveImage(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storageCallback");
            return;
        }
        doSave(call);
    }

    @PermissionCallback
    private void storageCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            doSave(call);
        } else {
            call.reject("Permissão de armazenamento negada");
        }
    }

    private void doSave(PluginCall call) {
        String data = call.getString("data");
        String fileName = call.getString("fileName", "cabine-" + System.currentTimeMillis() + ".jpg");
        String album = call.getString("album", "Cabine Mude");
        if (data == null) {
            call.reject("Imagem ausente");
            return;
        }
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        try {
            String uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + album);
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                Uri item = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (item == null) throw new Exception("Galeria indisponível");
                try (OutputStream out = resolver.openOutputStream(item)) {
                    if (out == null) throw new Exception("Galeria indisponível");
                    out.write(bytes);
                }
                values.clear();
                values.put(MediaStore.Images.Media.IS_PENDING, 0);
                resolver.update(item, values, null, null);
                uri = item.toString();
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), album);
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Não foi possível criar o álbum");
                File file = new File(dir, fileName);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(bytes);
                }
                MediaScannerConnection.scanFile(getContext(), new String[] { file.getAbsolutePath() }, new String[] { "image/jpeg" }, null);
                uri = Uri.fromFile(file).toString();
            }
            JSObject ret = new JSObject();
            ret.put("uri", uri);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Falha ao salvar: " + e.getMessage());
        }
    }
}
