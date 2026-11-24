# 樱旅小精灵 · Sakura Travel Pet

一个装在 DeepSeek Harness Web 界面里的**可拖动动画小精灵**。它根据你电脑当前的定位，每天推荐一道**当地特色美食**和一个**当地旅游景点**；角色是**原创 Q 版形象**，**每周一自动换一个**。

## 它能做什么

- 定位：优先通过公网 IP 自动获取城市（无需任何操作）；也可以在插件配置里填写 `city` 手动指定城市作为兜底。
- 每日推荐：调用 DSH 中**已配置的模型**生成当天的一条美食 + 一个景点推荐，并缓存，当天不再重复生成。
- 每周换角色：按 ISO 周数确定性地轮换 6 个原创 Q 版角色（桃桃 / 青岚 / 紫苏 / 金团 / 银月 / 红菱），周一自动切换。
- 交互：**点击角色会跳动**（压扁回弹）并收起/展开气泡；**拖动时会摇摆**（像被拎起来），位置会记住；气泡里的 ↻ 可重新生成。

## 安装

在 DSH 网页的 **插件 → Add plugin** 里输入包名 `@ninalym13/sakura-travel-pet` 安装并启用，然后刷新页面，右下角即出现精灵。本地开发可直接安装本目录。

## 配置（可选）

在插件行的 `config` 里可设置：

| 字段 | 说明 |
| --- | --- |
| `city` | 手动指定城市，覆盖 IP 定位（例如 `"上海"` 或 `"北京"`） |
| `provider` | 生成推荐所用的 provider 路由 id（默认 `deepseek-account`） |
| `model` | 生成推荐所用的模型 id（默认 `deepseek-v4-pro`） |

例如：

```yaml
- id: sakura-travel-pet
  name: '@ninalym13/sakura-travel-pet'
  config:
    city: 上海
```

## 发布（npm）

```bash
cd sakura-travel-pet
npm login          # 首次发布需要登录 npm 账号
npm publish        # 发布为 @ninalym13/sakura-travel-pet@0.1.0（publishConfig.access 已设为 public）
```

发布后，任何人可在 DSH 里用 `@ninalym13/sakura-travel-pet` 安装。若要让它出现在 DSH 的 Discover 市场里，还需把插件登记进一份 market index JSON（格式见 `dsh-plugin-market-index`）并配置 index 源。

## 前置条件与限制

- 需要一个**已配置且可用的模型**（设置 → 模型）才能生成推荐；没有模型时精灵会提示去配置模型。
- IP 定位是**城市级**的粗略定位，用于推荐“当地”内容已足够；需要精确到街区请手动填 `city`。
- 角色是**原创 Q 版形象**，并非《百变小樱》官方角色美术（该作品版权归 CLAMP 所有）。角色列表在 `client.js` 顶部的 `CHARACTERS` 数组中，可自行替换配色/配饰或扩展新角色。
- 推荐内容由模型生成，仅供参考，不保证实时准确。
