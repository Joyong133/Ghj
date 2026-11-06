package com.ghj.arena

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.TextView
import android.widget.Toast
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.dialog.MaterialAlertDialogBuilder

/**
 * 저장한 프롬프트 목록 화면 (아래에서 올라오는 시트).
 *
 * @param onPick 프롬프트를 고르면 호출 (입력창에 넣기)
 * @param readInput 지금 입력창에 쓰여 있는 글을 읽어서 넘겨 줌
 */
class PromptsSheet(
    private val activity: Activity,
    private val store: PromptStore,
    private val onPick: (Prompt) -> Unit,
    private val readInput: ((String?) -> Unit) -> Unit,
) {
    private var dialog: BottomSheetDialog? = null
    private var query = ""

    fun show() {
        val view = LayoutInflater.from(activity).inflate(R.layout.sheet_prompts, null)
        val sheet = BottomSheetDialog(activity)
        sheet.setContentView(view)
        sheet.behavior.state = BottomSheetBehavior.STATE_EXPANDED
        sheet.behavior.skipCollapsed = true
        dialog = sheet
        query = ""

        view.findViewById<View>(R.id.btnNew).setOnClickListener { edit(null, "") }
        view.findViewById<View>(R.id.btnFromInput).setOnClickListener {
            readInput { text ->
                if (text.isNullOrBlank()) toast("입력창이 비어 있어요. 먼저 내용을 적어 주세요.")
                else edit(null, text)
            }
        }
        view.findViewById<EditText>(R.id.search).addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) {
                query = s?.toString()?.trim().orEmpty()
                render()
            }
        })

        sheet.setOnDismissListener { if (dialog === sheet) dialog = null }
        render()
        sheet.show()
    }

    private fun render() {
        val sheet = dialog ?: return
        val list = sheet.findViewById<LinearLayout>(R.id.list) ?: return
        val empty = sheet.findViewById<TextView>(R.id.empty) ?: return
        val search = sheet.findViewById<EditText>(R.id.search) ?: return

        val all = store.all()
        search.visibility = if (all.size >= 6 || query.isNotEmpty()) View.VISIBLE else View.GONE

        val shown = if (query.isEmpty()) all else all.filter {
            it.title.contains(query, ignoreCase = true) || it.text.contains(query, ignoreCase = true)
        }
        empty.text = if (all.isEmpty()) {
            "아직 저장한 프롬프트가 없어요.\n자주 쓰는 문장을 저장해 보세요."
        } else {
            "'$query'에 맞는 프롬프트가 없어요."
        }
        empty.visibility = if (shown.isEmpty()) View.VISIBLE else View.GONE

        list.removeAllViews()
        val inflater = LayoutInflater.from(activity)
        shown.forEach { prompt ->
            val row = inflater.inflate(R.layout.item_prompt, list, false)
            row.findViewById<TextView>(R.id.title).text = prompt.displayTitle
            row.findViewById<TextView>(R.id.preview).text =
                prompt.text.trim().replace(Regex("\\s+"), " ")
            row.setOnClickListener {
                sheet.dismiss()
                onPick(prompt)
            }
            row.setOnLongClickListener { showMenu(it, prompt); true }
            val more = row.findViewById<ImageButton>(R.id.more)
            more.setOnClickListener { showMenu(it, prompt) }
            list.addView(row)
        }
    }

    private fun showMenu(anchor: View, prompt: Prompt) {
        val menu = PopupMenu(activity, anchor)
        menu.menu.add(0, 1, 0, "수정")
        menu.menu.add(0, 2, 1, "복사")
        menu.menu.add(0, 3, 2, "맨 위로")
        menu.menu.add(0, 4, 3, "삭제")
        menu.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                1 -> edit(prompt, prompt.text)
                2 -> {
                    val cm = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    cm.setPrimaryClip(ClipData.newPlainText("prompt", prompt.text))
                    toast("복사했어요")
                }
                3 -> {
                    store.moveToTop(prompt.id)
                    render()
                }
                4 -> MaterialAlertDialogBuilder(activity)
                    .setTitle("프롬프트 삭제")
                    .setMessage("'${prompt.displayTitle}'을(를) 지울까요?")
                    .setNegativeButton("취소", null)
                    .setPositiveButton("삭제") { _, _ ->
                        store.delete(prompt.id)
                        render()
                    }
                    .show()
            }
            true
        }
        menu.show()
    }

    /** 새로 만들기(prompt == null) 또는 수정 */
    private fun edit(prompt: Prompt?, initialText: String) {
        val form = LayoutInflater.from(activity).inflate(R.layout.dialog_prompt, null)
        val titleInput = form.findViewById<EditText>(R.id.editTitle)
        val textInput = form.findViewById<EditText>(R.id.editText)
        titleInput.setText(prompt?.title.orEmpty())
        textInput.setText(initialText)
        textInput.setSelection(textInput.text.length)

        val editDialog = MaterialAlertDialogBuilder(activity)
            .setTitle(if (prompt == null) "새 프롬프트" else "프롬프트 수정")
            .setView(form)
            .setNegativeButton("취소", null)
            .setPositiveButton("저장", null)
            .create()
        editDialog.setOnShowListener {
            // 내용이 비어 있으면 닫지 않고 안내
            editDialog.getButton(android.content.DialogInterface.BUTTON_POSITIVE).setOnClickListener {
                val text = textInput.text.toString()
                if (text.isBlank()) {
                    textInput.error = "내용을 적어 주세요"
                    return@setOnClickListener
                }
                store.upsert(prompt?.id, titleInput.text.toString().trim(), text)
                editDialog.dismiss()
                toast(if (prompt == null) "저장했어요" else "수정했어요")
                if (dialog == null) show() else render()
            }
            textInput.requestFocus()
        }
        editDialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)
        editDialog.show()
    }

    private fun toast(text: String) = Toast.makeText(activity, text, Toast.LENGTH_SHORT).show()
}
