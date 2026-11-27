const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

const PACKAGE_NAME = 'com.chargepilot.ai';
const PACKAGE_DIR = path.join('app', 'src', 'main', 'java', 'com', 'chargepilot', 'ai');

const SPEECH_MODULE_KT = `package ${PACKAGE_NAME}

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule

class ChargePilotSpeechModule(private val reactCtx: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactCtx) {

  private var speechRecognizer: SpeechRecognizer? = null
  private var sessionEnded = true

  override fun getName(): String = "ChargePilotSpeech"

  private fun emit(eventName: String, params: com.facebook.react.bridge.WritableMap? = null) {
    if (!reactCtx.hasActiveReactInstance()) return
    reactCtx
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  private fun emitEndOnce() {
    if (!sessionEnded) {
      sessionEnded = true
      emit("ChargePilotSpeech:end", null)
    }
  }

  private fun destroyRecognizer() {
    try {
      speechRecognizer?.cancel()
    } catch (_: Exception) {}
    try {
      speechRecognizer?.destroy()
    } catch (_: Exception) {}
    speechRecognizer = null
  }

  private fun mapSpeechError(code: Int): String {
    return when (code) {
      SpeechRecognizer.ERROR_AUDIO -> "Lỗi thu âm từ Microphone. Vui lòng thử lại."
      SpeechRecognizer.ERROR_CLIENT -> "Không khởi động được nhận diện giọng nói trên máy."
      SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Chưa có quyền Microphone. Hãy cấp quyền Micro trong Cài đặt."
      SpeechRecognizer.ERROR_NETWORK,
      SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Cần kết nối Internet để nhận diện giọng nói tiếng Việt."
      SpeechRecognizer.ERROR_NO_MATCH -> "Chưa nghe rõ câu nói. Bạn thử nói lại gần mic hơn nhé."
      SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Microphone đang bận, thử lại sau 1 giây nhé."
      SpeechRecognizer.ERROR_SERVER -> "Dịch vụ nhận diện giọng nói đang bận, vui lòng thử lại."
      SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Chưa thấy bạn nói gì. Bấm Mic để nói lại nhé."
      else -> "Chưa nhận diện được giọng nói (mã $code). Bạn thử nói lại hoặc gõ chữ nhé."
    }
  }

  @ReactMethod
  fun addListener(_eventName: String) {
    // Required for React Native NativeEventEmitter
  }

  @ReactMethod
  fun removeListeners(_count: Int) {
    // Required for React Native NativeEventEmitter
  }

  @ReactMethod
  fun isAvailable(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        promise.resolve(SpeechRecognizer.isRecognitionAvailable(reactCtx))
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun startListening(locale: String, promise: Promise) {
    val activeLocale = if (locale.isNotBlank()) locale else "vi-VN"
    UiThreadUtil.runOnUiThread {
      try {
        if (!SpeechRecognizer.isRecognitionAvailable(reactCtx)) {
          promise.reject(
            "SPEECH_UNAVAILABLE",
            "Thiết bị chưa cài hoặc chưa bật dịch vụ Nhận diện giọng nói Google."
          )
          return@runOnUiThread
        }

        destroyRecognizer()
        sessionEnded = false

        val recognizer = SpeechRecognizer.createSpeechRecognizer(reactCtx)
        speechRecognizer = recognizer

        recognizer.setRecognitionListener(object : RecognitionListener {
          override fun onReadyForSpeech(params: Bundle?) {
            emit("ChargePilotSpeech:start", null)
          }

          override fun onBeginningOfSpeech() {}

          override fun onRmsChanged(rmsdB: Float) {
            val map = Arguments.createMap()
            map.putDouble("rms", rmsdB.toDouble())
            emit("ChargePilotSpeech:rms", map)
          }

          override fun onBufferReceived(buffer: ByteArray?) {}

          override fun onEndOfSpeech() {}

          override fun onError(error: Int) {
            val map = Arguments.createMap()
            map.putInt("code", error)
            map.putString("message", mapSpeechError(error))
            emit("ChargePilotSpeech:error", map)
            destroyRecognizer()
            emitEndOnce()
          }

          override fun onResults(results: Bundle?) {
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val best = matches?.firstOrNull()?.trim().orEmpty()
            if (best.isNotEmpty()) {
              val map = Arguments.createMap()
              map.putString("text", best)
              emit("ChargePilotSpeech:result", map)
            } else {
              val errMap = Arguments.createMap()
              errMap.putInt("code", SpeechRecognizer.ERROR_NO_MATCH)
              errMap.putString("message", mapSpeechError(SpeechRecognizer.ERROR_NO_MATCH))
              emit("ChargePilotSpeech:error", errMap)
            }
            destroyRecognizer()
            emitEndOnce()
          }

          override fun onPartialResults(partialResults: Bundle?) {
            val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val best = matches?.firstOrNull()?.trim().orEmpty()
            if (best.isNotEmpty()) {
              val map = Arguments.createMap()
              map.putString("text", best)
              emit("ChargePilotSpeech:partial", map)
            }
          }

          override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(RecognizerIntent.EXTRA_LANGUAGE, activeLocale)
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, activeLocale)
          putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
          putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
          putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactCtx.packageName)
        }

        recognizer.startListening(intent)
        promise.resolve(activeLocale)
      } catch (err: Exception) {
        destroyRecognizer()
        sessionEnded = true
        promise.reject(
          "SPEECH_START_FAILED",
          err.message ?: "Không thể khởi động Microphone."
        )
      }
    }
  }

  @ReactMethod
  fun stopListening(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        speechRecognizer?.stopListening()
        promise.resolve(true)
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun cancelListening(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      destroyRecognizer()
      emitEndOnce()
      promise.resolve(true)
    }
  }

  override fun invalidate() {
    UiThreadUtil.runOnUiThread {
      destroyRecognizer()
      sessionEnded = true
    }
    super.invalidate()
  }
}
`;

const LOCATION_MODULE_KT = `package ${PACKAGE_NAME}

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class ChargePilotLocationModule(private val reactCtx: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactCtx) {

  private val ioExecutor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "ChargePilotLocation"

  private fun hasLocationPermission(): Boolean {
    val fine = ContextCompat.checkSelfPermission(reactCtx, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = ContextCompat.checkSelfPermission(reactCtx, Manifest.permission.ACCESS_COARSE_LOCATION)
    return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
  }

  @SuppressLint("MissingPermission")
  private fun bestLastKnownLocation(lm: LocationManager): Location? {
    val providers = listOf(
      LocationManager.GPS_PROVIDER,
      LocationManager.NETWORK_PROVIDER,
      LocationManager.PASSIVE_PROVIDER
    )
    var best: Location? = null
    for (p in providers) {
      try {
        val loc = lm.getLastKnownLocation(p) ?: continue
        if (best == null || loc.time > best.time) {
          best = loc
        }
      } catch (_: Exception) {}
    }
    return best
  }

  @Suppress("DEPRECATION")
  private fun resolveWithGeocoder(loc: Location, promise: Promise) {
    ioExecutor.execute {
      val map = Arguments.createMap()
      map.putDouble("lat", loc.latitude)
      map.putDouble("lon", loc.longitude)
      map.putDouble("accuracy", loc.accuracy.toDouble())
      try {
        if (Geocoder.isPresent()) {
          val geocoder = Geocoder(reactCtx, Locale("vi", "VN"))
          val list = geocoder.getFromLocation(loc.latitude, loc.longitude, 1)
          val addr = list?.firstOrNull()
          if (addr != null) {
            if (!addr.subLocality.isNullOrBlank()) map.putString("subLocality", addr.subLocality)
            if (!addr.subAdminArea.isNullOrBlank()) map.putString("subAdminArea", addr.subAdminArea)
            if (!addr.locality.isNullOrBlank()) map.putString("locality", addr.locality)
            if (!addr.adminArea.isNullOrBlank()) map.putString("adminArea", addr.adminArea)
            if (!addr.thoroughfare.isNullOrBlank()) map.putString("thoroughfare", addr.thoroughfare)
            val line = addr.getAddressLine(0)
            if (!line.isNullOrBlank()) map.putString("addressLine", line)
          }
        }
      } catch (_: Exception) {
        // Offline / Geocoder unavailable: return raw coordinates gracefully
      }
      promise.resolve(map)
    }
  }

  @SuppressLint("MissingPermission")
  @Suppress("DEPRECATION")
  @ReactMethod
  fun getCurrentPosition(timeoutMs: Double, promise: Promise) {
    if (!hasLocationPermission()) {
      promise.reject("LOCATION_PERMISSION_DENIED", "Chưa cấp quyền truy cập vị trí GPS.")
      return
    }

    val lm = reactCtx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
    if (lm == null) {
      promise.reject("LOCATION_UNAVAILABLE", "Thiết bị không có dịch vụ định vị.")
      return
    }

    val lastKnown = bestLastKnownLocation(lm)
    val now = System.currentTimeMillis()
    if (lastKnown != null && (now - lastKnown.time) < 60_000L && lastKnown.accuracy <= 150f) {
      resolveWithGeocoder(lastKnown, promise)
      return
    }

    val provider = when {
      lm.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
      lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
      else -> null
    }

    if (provider == null) {
      if (lastKnown != null) {
        resolveWithGeocoder(lastKnown, promise)
      } else {
        promise.reject("GPS_DISABLED", "Vui lòng bật Vị trí (GPS) trên điện thoại để định vị chính xác.")
      }
      return
    }

    val settled = AtomicBoolean(false)
    val handler = Handler(Looper.getMainLooper())
    val cancelSignal = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) CancellationSignal() else null
    var legacyListener: LocationListener? = null

    val timeoutRunnable = Runnable {
      if (settled.compareAndSet(false, true)) {
        try {
          cancelSignal?.cancel()
          legacyListener?.let { lm.removeUpdates(it) }
        } catch (_: Exception) {}
        val fallback = bestLastKnownLocation(lm)
        if (fallback != null) {
          resolveWithGeocoder(fallback, promise)
        } else {
          promise.reject("LOCATION_TIMEOUT", "Chưa bắt được tín hiệu GPS hiện tại.")
        }
      }
    }

    val safeTimeout = timeoutMs.toLong().coerceIn(3_000L, 20_000L)
    handler.postDelayed(timeoutRunnable, safeTimeout)

    handler.post {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          lm.getCurrentLocation(provider, cancelSignal, ioExecutor) { loc ->
            if (settled.compareAndSet(false, true)) {
              handler.removeCallbacks(timeoutRunnable)
              val chosen = loc ?: bestLastKnownLocation(lm)
              if (chosen != null) {
                resolveWithGeocoder(chosen, promise)
              } else {
                promise.reject("LOCATION_UNAVAILABLE", "Không lấy được toạ độ GPS hiện tại.")
              }
            }
          }
        } else {
          val listener = object : LocationListener {
            override fun onLocationChanged(loc: Location) {
              if (settled.compareAndSet(false, true)) {
                handler.removeCallbacks(timeoutRunnable)
                try { lm.removeUpdates(this) } catch (_: Exception) {}
                resolveWithGeocoder(loc, promise)
              }
            }
            override fun onStatusChanged(p: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(p: String) {}
            override fun onProviderDisabled(p: String) {}
          }
          legacyListener = listener
          lm.requestSingleUpdate(provider, listener, Looper.getMainLooper())
        }
      } catch (err: Exception) {
        if (settled.compareAndSet(false, true)) {
          handler.removeCallbacks(timeoutRunnable)
          val fallback = bestLastKnownLocation(lm)
          if (fallback != null) {
            resolveWithGeocoder(fallback, promise)
          } else {
            promise.reject("LOCATION_ERROR", err.message ?: "Lỗi khi đọc GPS.")
          }
        }
      }
    }
  }
}
`;

const NATIVE_PACKAGE_KT = `package ${PACKAGE_NAME}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ChargePilotNativePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(
      ChargePilotSpeechModule(reactContext),
      ChargePilotLocationModule(reactContext),
    )
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;

function ensurePermission(manifest, permName) {
  manifest['uses-permission'] = manifest['uses-permission'] || [];
  const exists = manifest['uses-permission'].some(
    (item) => item?.$?.['android:name'] === permName
  );
  if (!exists) {
    manifest['uses-permission'].push({ $: { 'android:name': permName } });
  }
}

function ensureSpeechQuery(manifest) {
  manifest.queries = manifest.queries || [];
  if (manifest.queries.length === 0) {
    manifest.queries.push({});
  }
  const q = manifest.queries[0];
  q.intent = q.intent || [];
  const hasSpeechIntent = q.intent.some((it) =>
    (it.action || []).some(
      (act) => act?.$?.['android:name'] === 'android.speech.RecognitionService'
    )
  );
  if (!hasSpeechIntent) {
    q.intent.push({
      action: [{ $: { 'android:name': 'android.speech.RecognitionService' } }],
    });
  }
}

function injectNativePackage(contents, language) {
  let out = contents;
  const importStmt = `import ${PACKAGE_NAME}.ChargePilotNativePackage`;

  if (language === 'kt') {
    if (!out.includes(importStmt)) {
      out = out.replace(
        /^package\s+[^\r\n]+/m,
        (line) => `${line}\n\n${importStmt}`
      );
    }
    if (!out.includes('ChargePilotNativePackage()')) {
      out = out.replace(
        /(PackageList\(this\)\.packages\.apply\s*\{)/,
        `$1\n          add(ChargePilotNativePackage())`
      );
    }
    return out;
  }

  if (!out.includes(`${importStmt};`)) {
    out = out.replace(
      /^package\s+[^\r\n]+;/m,
      (line) => `${line}\n\n${importStmt};`
    );
  }
  if (!out.includes('new ChargePilotNativePackage()')) {
    out = out.replace(
      /(List<ReactPackage>\s+packages\s*=\s*new\s+PackageList\(this\)\.getPackages\(\);)/,
      `$1\n      packages.add(new ChargePilotNativePackage());`
    );
  }
  return out;
}

const withChargePilotNative = (config) => {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    ensurePermission(manifest, 'android.permission.INTERNET');
    ensurePermission(manifest, 'android.permission.RECORD_AUDIO');
    ensurePermission(manifest, 'android.permission.ACCESS_FINE_LOCATION');
    ensurePermission(manifest, 'android.permission.ACCESS_COARSE_LOCATION');
    ensureSpeechQuery(manifest);
    return cfg;
  });

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const targetDir = path.join(cfg.modRequest.platformProjectRoot, PACKAGE_DIR);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'ChargePilotSpeechModule.kt'), SPEECH_MODULE_KT, 'utf8');
      fs.writeFileSync(path.join(targetDir, 'ChargePilotLocationModule.kt'), LOCATION_MODULE_KT, 'utf8');
      fs.writeFileSync(path.join(targetDir, 'ChargePilotNativePackage.kt'), NATIVE_PACKAGE_KT, 'utf8');
      return cfg;
    },
  ]);

  config = withMainApplication(config, (cfg) => {
    cfg.modResults.contents = injectNativePackage(
      cfg.modResults.contents,
      cfg.modResults.language
    );
    return cfg;
  });

  return config;
};

module.exports = withChargePilotNative;
