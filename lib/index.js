export const name = 'dsh-gamemode';
export const inject = ['commands', 'agentPresets'];
/** 内置预设的稳定 id；找不到时再按显示名回退。 */
const CREATIVE_PRESET_IDS = new Set(['cordis']);
const SURVIVAL_PRESET_IDS = new Set(['standard']);
function labelOf(preset) {
    return preset.name ?? preset.id;
}
/** 与 api-proxy 的 sessionBlank 判定保持一致：跑过任意 turn 即锁定。 */
function isBlankSession(invocation) {
    return !invocation.agent.session.events.some((event) => event.type === 'turn/start');
}
async function findPreset(ctx, mode) {
    const presets = await ctx.agentPresets.list();
    if (mode === 'creative') {
        return presets.find((preset) => CREATIVE_PRESET_IDS.has(preset.id))
            ?? presets.find((preset) => preset.name !== undefined && /创造|creative/i.test(preset.name));
    }
    return presets.find((preset) => SURVIVAL_PRESET_IDS.has(preset.id))
        ?? presets.find((preset) => preset.name !== undefined && /标准|生存|standard|survival/i.test(preset.name));
}
function parseGameMode(rawInput) {
    const token = rawInput.trim().toLowerCase();
    if (!token)
        return { recognized: true };
    if (token === '1' || token === 'creative' || token === 'c' || token === '创造' || token === '创造模式') {
        return { mode: 'creative', recognized: true };
    }
    if (token === '0' || token === 'survival' || token === 's' || token === '生存' || token === '生存模式'
        || token === 'standard' || token === '标准' || token === '标准模式') {
        return { mode: 'survival', recognized: true };
    }
    return { recognized: false };
}
function usageText() {
    return '用法：/gamemode 1（创造模式，内置 cordis 预设）| /gamemode 0（标准模式）。仅在新会话（还没开始对话）可用。';
}
function makeHandler(ctx) {
    return async function handleGamemod(invocation) {
        const { agent, rawInput } = invocation;
        const parsed = parseGameMode(rawInput);
        if (!parsed.recognized) {
            return {
                kind: 'error',
                text: `无法识别的游戏模式。${usageText()}`,
            };
        }
        if (parsed.mode === undefined) {
            const current = ctx.agentPresets.composedPreset(agent.ctx);
            const presets = await ctx.agentPresets.list();
            const currentPreset = presets.find((preset) => preset.id === current);
            const label = currentPreset === undefined
                ? (current ?? '（未挂载 Agent Preset）')
                : `${labelOf(currentPreset)}（${currentPreset.id}）`;
            return {
                kind: 'success',
                text: `当前预设：${label}。${usageText()}`,
            };
        }
        const target = await findPreset(ctx, parsed.mode);
        if (target === undefined || target.broken !== undefined) {
            const reason = target?.broken === undefined ? '内置预设不存在' : target.broken;
            return {
                kind: 'error',
                text: `找不到可用的${parsed.mode === 'creative' ? '创造模式' : '标准模式'}预设（cordis / standard）：${reason}。可用预设请用界面预设选择查看。`,
            };
        }
        const current = ctx.agentPresets.composedPreset(agent.ctx);
        if (current === target.id) {
            return {
                kind: 'success',
                text: `已经是${labelOf(target)}（预设 id：${target.id}），无需切换。`,
            };
        }
        if (!isBlankSession(invocation)) {
            return {
                kind: 'error',
                text: `会话已开始，Agent 预设已锁定，不能再切换（与界面预设选择规则一致）。请新建会话，在发第一条消息前使用 /gamemode 1。`,
            };
        }
        try {
            const switched = await ctx.agentPresets.recompose(agent.ctx, target.id);
            agent.session.append('agent-preset/selected', { agentPreset: switched.id });
            return {
                kind: 'success',
                text: `已切换到${labelOf(switched)}（预设 id：${switched.id}）。输入 /gamemode 1 成功切换为创造模式。`,
            };
        }
        catch (error) {
            return {
                kind: 'error',
                text: `切换预设失败：${error instanceof Error ? error.message : String(error)}`,
            };
        }
    };
}
export function apply(ctx) {
    ctx.effect(() => {
        const handler = makeHandler(ctx);
        const disposeGamemode = ctx.commands.register({
            name: 'gamemode',
            description: '切换 Agent 预设：/gamemode 1 = 创造模式（cordis），/gamemode 0 = 标准模式',
            input: { hint: '1 = 创造模式（cordis 预设），0 = 标准模式' },
            handler,
        });
        return () => {
            disposeGamemode();
        };
    }, 'dsh-gamemode: preset-switch commands');
}
//# sourceMappingURL=index.js.map