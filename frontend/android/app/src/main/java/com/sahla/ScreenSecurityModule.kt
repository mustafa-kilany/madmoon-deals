package com.sahla

import android.view.WindowManager
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * SECURITY_PLAN S6.5: while a screen with a delivery PIN, a card number or a bank account is open,
 * Android's FLAG_SECURE keeps it out of screenshots, screen recordings and the app switcher.
 * src/lib/secureScreen.ts turns it on and off.
 */
@ReactModule(name = ScreenSecurityModule.NAME)
class ScreenSecurityModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = NAME

  @ReactMethod
  fun setSecure(secure: Boolean) {
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread {
      if (secure) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
      else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }
  }

  companion object {
    const val NAME = "ScreenSecurity"
  }
}

class ScreenSecurityPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == ScreenSecurityModule.NAME) ScreenSecurityModule(reactContext) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
      ScreenSecurityModule.NAME to
        ReactModuleInfo(
          name = ScreenSecurityModule.NAME,
          className = ScreenSecurityModule.NAME,
          canOverrideExistingModule = false,
          needsEagerInit = false,
          isCxxModule = false,
          isTurboModule = false,
        ),
    )
  }
}
