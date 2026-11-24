package com.focustodo.app

import android.app.Activity
import android.content.Intent
import android.graphics.drawable.Drawable
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.BaseAdapter
import android.widget.CheckBox
import android.widget.ImageView
import android.widget.ListView
import android.widget.TextView
import android.widget.Toast

class AllowedAppsActivity : Activity() {

    private class AppEntry(val pkg: String, val label: String, val icon: Drawable)

    private lateinit var store: FocusStore
    private var apps: List<AppEntry> = emptyList()
    private val selected = mutableSetOf<String>()
    private var core: Set<String> = emptySet()
    private val adapter = AppAdapter()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_allowed)
        store = FocusStore(this)
        selected += store.extraAllowed()
        core = FocusPolicy.coreApps(this)

        val list = findViewById<ListView>(R.id.appList)
        list.adapter = adapter
        list.onItemClickListener = AdapterView.OnItemClickListener { _, _, position, _ ->
            val app = apps[position]
            when {
                app.pkg in core -> Toast.makeText(this, "전화·문자·연락처는 항상 허용돼요", Toast.LENGTH_SHORT).show()
                store.isFocusActive() -> {
                    Toast.makeText(this, "🔒 집중 중에는 바꿀 수 없어요", Toast.LENGTH_SHORT).show()
                    refreshLock()
                }
                else -> {
                    if (!selected.remove(app.pkg)) selected += app.pkg
                    store.setExtraAllowed(selected.toSet())
                    adapter.notifyDataSetChanged()
                }
            }
        }

        Thread {
            val pm = packageManager
            val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val loaded = pm.queryIntentActivities(launcher, 0)
                .map { it.activityInfo.applicationInfo }
                .distinctBy { it.packageName }
                .filter { it.packageName != packageName }
                .map { AppEntry(it.packageName, pm.getApplicationLabel(it).toString(), pm.getApplicationIcon(it)) }
                .sortedWith(compareBy<AppEntry>({ it.pkg !in core }, { it.pkg !in selected }, { it.label }))
            runOnUiThread {
                apps = loaded
                adapter.notifyDataSetChanged()
            }
        }.start()
    }

    override fun onResume() {
        super.onResume()
        refreshLock()
    }

    private fun refreshLock() {
        findViewById<View>(R.id.allowedLocked).visibility =
            if (store.isFocusActive()) View.VISIBLE else View.GONE
    }

    private inner class AppAdapter : BaseAdapter() {
        override fun getCount() = apps.size
        override fun getItem(position: Int) = apps[position]
        override fun getItemId(position: Int) = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val v = convertView ?: layoutInflater.inflate(R.layout.item_app, parent, false)
            val app = apps[position]
            v.findViewById<ImageView>(R.id.appIcon).setImageDrawable(app.icon)
            v.findViewById<TextView>(R.id.appLabel).text =
                if (app.pkg in core) "${app.label}  (기본 허용)" else app.label
            val check = v.findViewById<CheckBox>(R.id.appCheck)
            check.isChecked = app.pkg in core || app.pkg in selected
            check.isEnabled = app.pkg !in core
            return v
        }
    }
}
