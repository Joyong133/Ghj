package com.ghj.japantv;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import java.util.List;
import java.util.function.Consumer;

public class ChannelAdapter extends RecyclerView.Adapter<ChannelAdapter.Holder> {
    private final List<Channel> items;
    private final Consumer<Channel> onClick;
    private final Consumer<Channel> onLongClick;
    private String lastId;

    public ChannelAdapter(List<Channel> items, Consumer<Channel> onClick, Consumer<Channel> onLongClick) {
        this.items = items;
        this.onClick = onClick;
        this.onLongClick = onLongClick;
    }

    public void setLastId(String id) {
        lastId = id;
    }

    @NonNull
    @Override
    public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_channel, parent, false);
        return new Holder(v);
    }

    @Override
    public void onBindViewHolder(@NonNull Holder h, int position) {
        Channel c = items.get(position);
        h.icon.setText(c.icon);
        h.name.setText(c.name);
        h.desc.setText(c.description.isEmpty() ? c.url : c.description);
        h.tag.setText(c.typeLabel());
        h.last.setVisibility(c.id.equals(lastId) ? View.VISIBLE : View.GONE);
        h.itemView.setOnClickListener(v -> onClick.accept(c));
        h.itemView.setOnLongClickListener(v -> {
            onLongClick.accept(c);
            return true;
        });
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class Holder extends RecyclerView.ViewHolder {
        final TextView icon;
        final TextView name;
        final TextView desc;
        final TextView tag;
        final TextView last;

        Holder(View v) {
            super(v);
            icon = v.findViewById(R.id.icon);
            name = v.findViewById(R.id.name);
            desc = v.findViewById(R.id.desc);
            tag = v.findViewById(R.id.tag);
            last = v.findViewById(R.id.lastWatched);
        }
    }
}
