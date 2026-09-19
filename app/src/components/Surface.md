# 圆角规范

所有应用界面使用 `app.css` 的 `--ui-radius-*` 变量，不随屏幕宽度连续放大。

| 级别 | 数值 | 用途 |
| --- | --- | --- |
| small | 4px | 小按钮、地图缩放按钮组、热力格 |
| medium | 8px | 输入框、菜单、指标块、地图视口 |
| large | 12px | 活动日志、报表、图表、设置卡片、弹窗 |
| pill | 9999px | 语言、外观、地图服务切换等胶囊及圆形头像 |

复用 `Surface`，默认 large，支持 `radius="small"`、`radius="medium"`、`radius="large"`、`radius="pill"`，以及 `as="section"` / `as="article"`。颜色、间距和边框由调用方决定。

现有 Tailwind `rounded-sm` / `rounded-md` / `rounded-lg` 同样映射 4 / 8 / 12px；较大的历史别名统一映射 large。真正的胶囊继续使用 `rounded-full`。

Logo 的超级椭圆、国旗图像裁切和第三方地图 SDK 原生控件不属于普通卡片几何；保留各自形状。应用提供的默认地图控制组为 4px，外部地图容器为 8px。

圆角规范（当前）：`small` 4px、`medium` 8px、`large` 12px、`xlarge` 20px。
设置工作区使用 `<Surface radius="xlarge">`；普通独立卡片默认 `large`。
按钮和输入框使用 medium，小型复制按钮使用 small。胶囊、头像保留圆形语义。
统一样式位于 `styles/radius-system.css`，不再使用全站直角覆盖。
