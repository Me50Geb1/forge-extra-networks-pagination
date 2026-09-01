# Forge Extra Networks Pagination

Pagination extension for the LoRA Extra Networks panel in **sd-webui-forge-neo**.

LoRAの数が多い環境で、Extra NetworksのLoRAカードを全件一括表示せず、ページ単位で表示するための拡張です。

## Features

- LoRA Extra Networksをページ分割表示
- 1ページあたりの表示件数を変更可能
  - 25
  - 50
  - 60
  - 100
  - 200
- デフォルトは60件表示
- 前後ページ移動
- ページ番号をクリックして直接ジャンプ
- フォルダ選択に対応
- LoRA検索に対応
- txt2img / img2img 両対応
- Forge Neo純正のLoRAカードを使用
- ダークモード対応
- Civitai HelperなどのExtra Networks拡張との併用を考慮
- ページ切り替え後にCivitai Helperのカード更新を自動実行

## Purpose

Forge NeoのLoRAタブは画像付きで非常に使いやすい一方、LoRAの数が増えると大量のカードを一度に表示するため、Extra Networksの表示に時間がかかる場合があります。

この拡張ではLoRAカードを一定件数ごとにページ分割し、一度に表示するカード数を減らします。

## Installation

以下のリポジトリを `sd-webui-forge-neo/extensions/` にCloneします。

    git clone https://github.com/Me50Geb1/forge-extra-networks-pagination.git

配置例:

    sd-webui-forge-neo/
    └─ extensions/
       └─ forge-extra-networks-pagination/
          ├─ javascript/
          ├─ scripts/
          ├─ README.md
          └─ style.css

インストール後、Forge Neoを再起動してください。

## Usage

LoRA Extra Networksを開くと、上部ツールバーにページ操作UIが追加されます。

表示例:

    ◀  1 / 12  ▶  60 ▼  687件

- `◀` : 前のページ
- `▶` : 次のページ
- `1 / 12` : クリックするとページジャンプ
- `60` : 1ページあたりの表示件数
- `687件` : 現在の対象LoRA総数

## Compatibility

Main target:

- sd-webui-forge-neo

The extension is designed to preserve the standard Extra Networks card behavior as much as possible.

Tested together with:

- Stable-Diffusion-Webui-Civitai-Helper-Neo 1.13.0以降
- lora-prompt-tool

## Notes

This extension modifies the LoRA Extra Networks display behavior only.

It does not modify LoRA model files or generation behavior.

This extension was created with the assistance of ChatGPT.

The repository owner may not be able to answer technical questions, provide support, or respond to implementation-related inquiries.

この拡張はChatGPTの支援により作成されています。

リポジトリ所有者は技術的な質問、サポート、実装に関する問い合わせには対応できない場合があります。

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
