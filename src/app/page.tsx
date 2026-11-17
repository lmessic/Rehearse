"use client";
import { usePromptStore } from "@/store/promptStore";
import { generatePrompt } from "@/lib/promptBuilder";

export default function HomePage() {
  const { currentConfig, setCurrentConfig, resetCurrentConfig } =
    usePromptStore();
  const { positive, negative } = generatePrompt(currentConfig);

  // 示例配置，点击载入表单
  const loadSampleConfig = () => {
    setCurrentConfig({
      style: "shinkai makoto",
      character: {
        gender: "少女",
        age: "青少年",
        hair: "长发",
        eye: "蓝瞳",
        expression: "微笑",
        clothes: "连衣裙",
        customText: "风吹起长发，花瓣飘落",
      },
      scene: { composition: "半身像", light: "黄昏" },
      extraQuality: ["masterpiece", "best quality"],
      useNegative: true,
      negativeText: currentConfig.negativeText,
    });
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* 左侧表单面板 */}
      <div className="border rounded-xl p-4 dark:border-slate-600 dark:bg-slate-800">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">配置面板</h2>
          <div className="flex gap-2">
            <button
              onClick={loadSampleConfig}
              className="px-2 py-1.5 bg-amber-500 text-white rounded text-sm hover:bg-amber-600"
            >
              加载示例配置
            </button>
            <button
              onClick={resetCurrentConfig}
              className="px-2 py-1.5 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
            >
              重置
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block mb-1 text-sm font-medium">画风</label>
            <input
              value={currentConfig.style}
              onChange={(e) => setCurrentConfig({ style: e.target.value })}
              className="w-full border rounded p-2 dark:bg-slate-700 dark:border-slate-600"
              placeholder="例如 shinkai makoto / ghibli style"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-sm font-medium">性别</label>
              <input
                value={currentConfig.character.gender}
                onChange={(e) =>
                  setCurrentConfig({
                    character: {
                      ...currentConfig.character,
                      gender: e.target.value,
                    },
                  })
                }
                className="w-full border rounded p-2 dark:bg-slate-700 dark:border-slate-600"
                placeholder="少女"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">年龄段</label>
              <input
                value={currentConfig.character.age}
                onChange={(e) =>
                  setCurrentConfig({
                    character: {
                      ...currentConfig.character,
                      age: e.target.value,
                    },
                  })
                }
                className="w-full border rounded p-2 dark:bg-slate-700 dark:border-slate-600"
                placeholder="青少年"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-sm font-medium">发型</label>
              <input
                value={currentConfig.character.hair}
                onChange={(e) =>
                  setCurrentConfig({
                    character: {
                      ...currentConfig.character,
                      hair: e.target.value,
                    },
                  })
                }
                className="w-full border rounded p-2 dark:bg-slate-700 dark:border-slate-600"
                placeholder="长发"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">瞳色</label>
              <input
                value={currentConfig.character.eye}
                onChange={(e) =>
                  setCurrentConfig({
                    character: {
                      ...currentConfig.character,
                      eye: e.target.value,
                    },
                  })
                }
                className="w-full border rounded p-2 dark:bg-slate-700 dark:border-slate-600"
                placeholder="蓝瞳"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-sm font-medium">表情</label>
              <input
                value={currentConfig.character.expression}
                onChange={(e) =>
                  setCurrentConfig({
                    character: {
                      ...currentConfig.character,
                      expression: e.target.value,
                    },
                  })
                }
                className="w-full border rounded p-2 dark:bg-slate-700 dark:border-slate-600"
                placeholder="微笑"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">服装</label>
              <input
                value={currentConfig.character.clothes}
                onChange={(e) =>
                  setCurrentConfig({
                    character: {
                      ...currentConfig.character,
                      clothes: e.target.value,
                    },
                  })
                }
                className="w-full border rounded p-2 dark:bg-slate-700 dark:border-slate-600"
                placeholder="连衣裙"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium">
              角色自定义描述
            </label>
            <textarea
              value={currentConfig.character.customText}
              onChange={(e) =>
                setCurrentConfig({
                  character: {
                    ...currentConfig.character,
                    customText: e.target.value,
                  },
                })
              }
              className="w-full border rounded p-2 dark:bg-slate-700 dark:border-slate-600"
              placeholder="风吹起长发，花瓣飘落"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-sm font-medium">构图</label>
              <input
                value={currentConfig.scene.composition}
                onChange={(e) =>
                  setCurrentConfig({
                    scene: {
                      ...currentConfig.scene,
                      composition: e.target.value,
                    },
                  })
                }
                className="w-full border rounded p-2 dark:bg-slate-700 dark:border-slate-600"
                placeholder="半身像"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">光影</label>
              <input
                value={currentConfig.scene.light}
                onChange={(e) =>
                  setCurrentConfig({
                    scene: { ...currentConfig.scene, light: e.target.value },
                  })
                }
                className="w-full border rounded p-2 dark:bg-slate-700 dark:border-slate-600"
                placeholder="黄昏"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium">
              画质关键词（逗号分隔）
            </label>
            <input
              value={currentConfig.extraQuality.join(", ")}
              onChange={(e) => {
                const arr = e.target.value
                  .split(",")
                  .map((i) => i.trim())
                  .filter(Boolean);
                setCurrentConfig({ extraQuality: arr });
              }}
              className="w-full border rounded p-2 dark:bg-slate-700 dark:border-slate-600"
              placeholder="masterpiece, best quality"
            />
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={currentConfig.useNegative}
                onChange={(e) =>
                  setCurrentConfig({ useNegative: e.target.checked })
                }
              />
              启用负面提示词
            </label>
            {currentConfig.useNegative && (
              <textarea
                value={currentConfig.negativeText}
                onChange={(e) =>
                  setCurrentConfig({ negativeText: e.target.value })
                }
                className="mt-2 w-full border rounded p-2 dark:bg-slate-700 dark:border-slate-600"
                rows={2}
              />
            )}
          </div>
        </div>
      </div>

      {/* 右侧Prompt预览区域 */}
      <div className="space-y-4">
        <div className="border rounded-xl p-4 dark:border-slate-600 dark:bg-slate-800">
          <h2 className="text-lg font-bold mb-3">正向 Prompt</h2>
          <textarea
            readOnly
            value={positive}
            className="w-full border rounded p-2 dark:bg-slate-700 dark:border-slate-600 min-h-[140px]"
          />
        </div>
        <div className="border rounded-xl p-4 dark:border-slate-600 dark:bg-slate-800">
          <h2 className="text-lg font-bold mb-3">负面 Prompt</h2>
          <textarea
            readOnly
            value={negative}
            className="w-full border rounded p-2 dark:bg-slate-700 dark:border-slate-600 min-h-[140px]"
          />
        </div>
      </div>
    </div>
  );
}
