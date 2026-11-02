package com.geotrack.app;

import android.Manifest;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.DhcpInfo;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import androidx.core.content.FileProvider;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.util.Enumeration;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WifiHelperPlugin.class);
        registerPlugin(ShareHelperPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @CapacitorPlugin(
        name = "WifiHelper",
        permissions = {
            @Permission(
                strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION },
                alias = "location"
            )
        }
    )
    public static class WifiHelperPlugin extends Plugin {

        private Network getWifiNetwork() {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Network bound = cm.getBoundNetworkForProcess();
                    if (bound != null) {
                        NetworkCapabilities caps = cm.getNetworkCapabilities(bound);
                        if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                            return bound;
                        }
                    }
                }
                for (Network net : cm.getAllNetworks()) {
                    NetworkCapabilities caps = cm.getNetworkCapabilities(net);
                    if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                        return net;
                    }
                }
            }
            return null;
        }

        private String intToIp(int i) {
            if (i == 0) return null;
            return (i & 0xFF) + "." + ((i >> 8) & 0xFF) + "." + ((i >> 16) & 0xFF) + "." + ((i >> 24) & 0xFF);
        }

        @PluginMethod
        public void openWifiSettings(PluginCall call) {
            try {
                Intent intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Gagal membuka pengaturan Wi-Fi: " + e.getMessage());
            }
        }

        @PluginMethod
        public void isWifiEnabled(PluginCall call) {
            try {
                WifiManager wifiManager = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                boolean enabled = wifiManager != null && wifiManager.isWifiEnabled();
                JSObject ret = new JSObject();
                ret.put("enabled", enabled);
                call.resolve(ret);
            } catch (Exception e) {
                JSObject ret = new JSObject();
                ret.put("enabled", false);
                call.resolve(ret);
            }
        }

        @PluginMethod
        public void isLocationEnabled(PluginCall call) {
            try {
                LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
                boolean gpsEnabled = false;
                boolean networkEnabled = false;
                if (lm != null) {
                    try { gpsEnabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER); } catch (Exception ignored) {}
                    try { networkEnabled = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER); } catch (Exception ignored) {}
                }
                JSObject ret = new JSObject();
                ret.put("enabled", gpsEnabled || networkEnabled);
                ret.put("gps", gpsEnabled);
                ret.put("network", networkEnabled);
                call.resolve(ret);
            } catch (Exception e) {
                JSObject ret = new JSObject();
                ret.put("enabled", false);
                ret.put("error", e.getMessage());
                call.resolve(ret);
            }
        }

        @PluginMethod
        public void openLocationSettings(PluginCall call) {
            try {
                Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Gagal membuka pengaturan lokasi: " + e.getMessage());
            }
        }

        @PluginMethod
        public void checkLocationPermission(PluginCall call) {
            boolean granted = getPermissionState("location") == PermissionState.GRANTED;
            JSObject ret = new JSObject();
            ret.put("granted", granted);
            call.resolve(ret);
        }

        @PluginMethod
        public void requestLocationPermission(PluginCall call) {
            if (getPermissionState("location") == PermissionState.GRANTED) {
                JSObject ret = new JSObject();
                ret.put("granted", true);
                call.resolve(ret);
            } else {
                requestPermissionForAlias("location", call, "locationPermsCallback");
            }
        }

        @PermissionCallback
        private void locationPermsCallback(PluginCall call) {
            boolean granted = getPermissionState("location") == PermissionState.GRANTED;
            JSObject ret = new JSObject();
            ret.put("granted", granted);
            call.resolve(ret);
        }

        @PluginMethod
        public void bindToWifi(PluginCall call) {
            try {
                ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
                Network wifiNet = getWifiNetwork();
                boolean bound = false;
                if (cm != null && wifiNet != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    bound = cm.bindProcessToNetwork(wifiNet);
                } else if (cm != null && wifiNet != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    bound = ConnectivityManager.setProcessDefaultNetwork(wifiNet);
                }
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("bound", bound);
                call.resolve(ret);
            } catch (Exception e) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", e.getMessage());
                call.resolve(ret);
            }
        }

        @PluginMethod
        public void unbindNetwork(PluginCall call) {
            try {
                ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    cm.bindProcessToNetwork(null);
                } else if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    ConnectivityManager.setProcessDefaultNetwork(null);
                }
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                call.resolve(ret);
            }
        }

        @PluginMethod
        public void getWifiIp(PluginCall call) {
            try {
                String ipAddress = null;
                String gatewayIp = null;
                boolean isEspSubnet = false;

                WifiManager wifiManager = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wifiManager != null) {
                    DhcpInfo dhcp = wifiManager.getDhcpInfo();
                    if (dhcp != null) {
                        ipAddress = intToIp(dhcp.ipAddress);
                        gatewayIp = intToIp(dhcp.gateway);
                        if ((ipAddress != null && ipAddress.startsWith("192.168.4.")) ||
                            (gatewayIp != null && gatewayIp.startsWith("192.168.4."))) {
                            isEspSubnet = true;
                        }
                    }
                }

                if (ipAddress == null || !isEspSubnet) {
                    Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
                    while (interfaces != null && interfaces.hasMoreElements()) {
                        NetworkInterface iface = interfaces.nextElement();
                        if (iface.isLoopback() || !iface.isUp()) continue;

                        Enumeration<InetAddress> addresses = iface.getInetAddresses();
                        while (addresses.hasMoreElements()) {
                            InetAddress addr = addresses.nextElement();
                            if (!addr.isLoopbackAddress() && addr instanceof Inet4Address) {
                                String host = addr.getHostAddress();
                                if (host == null) continue;

                                if (host.startsWith("192.168.4.")) {
                                    ipAddress = host;
                                    isEspSubnet = true;
                                    break;
                                } else if (iface.getName().toLowerCase().contains("wlan") && ipAddress == null) {
                                    ipAddress = host;
                                }
                            }
                        }
                        if (isEspSubnet) break;
                    }
                }

                // Jika terhubung ke ESP32, otomatis bind koneksi process ke Wi-Fi agar WebView tidak route via seluler!
                if (isEspSubnet) {
                    try {
                        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
                        Network wifiNet = getWifiNetwork();
                        if (cm != null && wifiNet != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            cm.bindProcessToNetwork(wifiNet);
                        }
                    } catch (Exception ignored) {}
                }

                JSObject ret = new JSObject();
                ret.put("ip", ipAddress);
                ret.put("gateway", gatewayIp);
                ret.put("isGioT", isEspSubnet || "192.168.4.2".equals(ipAddress) || "192.168.4.1".equals(ipAddress));
                ret.put("isEsp32", isEspSubnet || "192.168.4.2".equals(ipAddress) || "192.168.4.1".equals(ipAddress));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Gagal membaca IP: " + e.getMessage());
            }
        }

        @PluginMethod
        public void fetchWifi(PluginCall call) {
            String urlStr = call.getString("url");
            if (urlStr == null || urlStr.isEmpty()) {
                call.reject("URL wajib diisi");
                return;
            }
            String method = call.getString("method", "GET");
            String body = call.getString("body", null);
            int timeout = call.getInt("timeout", 3000);

            new Thread(() -> {
                HttpURLConnection conn = null;
                try {
                    Network wifiNet = getWifiNetwork();
                    URL url = new URL(urlStr);

                    if (wifiNet != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        conn = (HttpURLConnection) wifiNet.openConnection(url);
                    } else {
                        conn = (HttpURLConnection) url.openConnection();
                    }

                    conn.setConnectTimeout(timeout);
                    conn.setReadTimeout(timeout);
                    conn.setRequestMethod(method.toUpperCase());
                    conn.setUseCaches(false);
                    conn.setDefaultUseCaches(false);

                    if ("POST".equalsIgnoreCase(method)) {
                        conn.setDoOutput(true);
                        byte[] input = (body != null && !body.isEmpty()) ? body.getBytes("UTF-8") : new byte[0];
                        if (input.length > 0) {
                            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                        }
                        conn.setFixedLengthStreamingMode(input.length);
                        try (OutputStream os = conn.getOutputStream()) {
                            if (input.length > 0) {
                                os.write(input, 0, input.length);
                            }
                            os.flush();
                        }
                    }

                    int code = conn.getResponseCode();
                    InputStream is = (code >= 200 && code < 400) ? conn.getInputStream() : conn.getErrorStream();
                    StringBuilder sb = new StringBuilder();
                    if (is != null) {
                        BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
                        String line;
                        while ((line = reader.readLine()) != null) {
                            sb.append(line);
                        }
                        reader.close();
                    }

                    JSObject ret = new JSObject();
                    ret.put("ok", code >= 200 && code < 300);
                    ret.put("status", code);
                    ret.put("data", sb.toString());
                    call.resolve(ret);
                } catch (Exception e) {
                    JSObject ret = new JSObject();
                    ret.put("ok", false);
                    ret.put("status", 0);
                    ret.put("error", e.getMessage() != null ? e.getMessage() : "Koneksi gagal");
                    call.resolve(ret);
                } finally {
                    if (conn != null) {
                        conn.disconnect();
                    }
                }
            }).start();
        }
    }

    @CapacitorPlugin(name = "ShareHelper")
    public static class ShareHelperPlugin extends Plugin {

        @PluginMethod
        public void shareFile(PluginCall call) {
            String base64Data = call.getString("base64Data");
            String filename = call.getString("filename", "geotrack-activity.png");
            String title = call.getString("title", "Aktivitas Lari GeoTrack");
            String text = call.getString("text", "");
            String target = call.getString("target", "native");

            if (base64Data == null || base64Data.isEmpty()) {
                call.reject("Data gambar tidak boleh kosong");
                return;
            }

            try {
                if (base64Data.contains(",")) {
                    base64Data = base64Data.split(",")[1];
                }
                byte[] imageBytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT);

                File cacheDir = getContext().getCacheDir();
                File sharedDir = new File(cacheDir, "shared_images");
                if (!sharedDir.exists()) {
                    sharedDir.mkdirs();
                }
                File imageFile = new File(sharedDir, filename);
                FileOutputStream fos = new FileOutputStream(imageFile);
                fos.write(imageBytes);
                fos.flush();
                fos.close();

                Context ctx = getContext();
                Uri contentUri = FileProvider.getUriForFile(
                    ctx,
                    ctx.getPackageName() + ".fileprovider",
                    imageFile
                );

                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType("image/png");
                shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                if (text != null && !text.isEmpty()) {
                    shareIntent.putExtra(Intent.EXTRA_TEXT, text);
                }
                if (title != null && !title.isEmpty()) {
                    shareIntent.putExtra(Intent.EXTRA_TITLE, title);
                    shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
                }
                shareIntent.setClipData(ClipData.newRawUri("", contentUri));
                shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                boolean launchedDirect = false;
                if ("whatsapp".equalsIgnoreCase(target)) {
                    try {
                        Intent waIntent = new Intent(shareIntent);
                        waIntent.setPackage("com.whatsapp");
                        waIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        ctx.startActivity(waIntent);
                        launchedDirect = true;
                    } catch (Exception e) {
                        // WhatsApp belum terpasang atau ditolak, buka chooser
                    }
                } else if ("instagram".equalsIgnoreCase(target)) {
                    try {
                        Intent igIntent = new Intent(shareIntent);
                        igIntent.setPackage("com.instagram.android");
                        igIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        ctx.startActivity(igIntent);
                        launchedDirect = true;
                    } catch (Exception e) {
                        // Instagram belum terpasang, buka chooser
                    }
                }

                if (!launchedDirect) {
                    Intent chooser = Intent.createChooser(shareIntent, title != null ? title : "Bagikan Aktivitas");
                    chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(chooser);
                }

                JSObject res = new JSObject();
                res.put("success", true);
                res.put("target", target);
                res.put("direct", launchedDirect);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Gagal membagikan gambar: " + e.getMessage(), e);
            }
        }
    }
}
