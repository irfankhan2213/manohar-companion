plugins {
  alias(libs.plugins.android.application)
}

android {
  namespace = "com.manohartraders.companion"
  compileSdk = 34

  defaultConfig {
    applicationId = "com.manohartraders.companion"
    minSdk = 24
    targetSdk = 34
    versionCode = 1
    versionName = "1.0.0"
  }

  signingConfigs {
    create("release") {
      storeFile = file("release.keystore")
      storePassword = "manohar123"
      keyAlias = "manohar"
      keyPassword = "manohar123"
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      signingConfig = signingConfigs.getByName("release")
    }
    debug {
      signingConfig = signingConfigs.getByName("release")
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  buildFeatures {
    compose = false
    aidl = false
    buildConfig = false
    shaders = false
  }
}

dependencies {
  // Ultra-lightweight: zero external dependencies, native Android SDK only
}
