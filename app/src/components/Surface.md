# Surface

共享容器，默认 `as="div"`、`radius="large"`。支持 section/article 及 small/medium/large/xlarge/pill；颜色、边框和布局由调用方负责。

完整界面规范见 [DESIGN-SYSTEM.md](../../../DESIGN-SYSTEM.md)。除语义 pill 外，组件自动添加 `.squircle`。半径通过 `radius-system.css` 的 `--sq-r` 维护，支持原生超椭圆及 0.54 倍普通圆角降级；颜色、尺寸、间距与阴影仍由调用方负责。拼接容器可使用 `--sq-tl/tr/br/bl` 控制单个角。
