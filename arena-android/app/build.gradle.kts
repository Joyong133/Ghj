plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// CI에서 빌드할 때마다 버전 코드가 올라가서 기존 앱 위에 덮어 설치됩니다.
val buildNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1

android {
    namespace = "com.ghj.arena"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ghj.arena"
        minSdk = 24
        targetSdk = 35
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
    }

    // 서명 키는 저장소에 두지 않습니다. CI가 키 파일을 만들거나(캐시에 보관)
    // GitHub Secret에서 꺼내 app/arena.keystore에 둡니다. 키가 없으면 디버그 키로 서명합니다.
    val keystoreFile = file("arena.keystore")
    val keystorePassword = System.getenv("ARENA_KEYSTORE_PASSWORD") ?: "android"
    signingConfigs {
        create("release") {
            storeFile = keystoreFile
            storePassword = keystorePassword
            keyAlias = "arena"
            keyPassword = keystorePassword
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName(
                if (keystoreFile.exists()) "release" else "debug"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
