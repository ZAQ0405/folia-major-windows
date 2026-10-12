export interface JizuraStyleOption {
    value: string;
    label: string;
    description: string;
}

export interface JizuraThemeOption {
    value: 'lyricpv' | 'kinetic' | 'wa' | 'horror' | 'pop' | 'ballad';
    label: string;
    description: string;
}

/** The top-level direction selector from JIZURA's own MV workflow. */
export const JIZURA_THEME_OPTIONS: JizuraThemeOption[] = [
    { value: 'lyricpv', label: '文字 PV', description: '排版、字体与歌词构图' },
    { value: 'kinetic', label: '动态文字', description: '逐字运动、切换与动态构成' },
    { value: 'wa', label: '和风', description: '和纸、灯笼、障子与东方纹样' },
    { value: 'horror', label: '恐怖', description: '恐怖素材与不安氛围' },
    { value: 'pop', label: '流行', description: '明快、跳跃与高能量构图' },
    { value: 'ballad', label: '抒情', description: '缓慢、克制与情绪化表达' },
];

export const getJizuraThemeLabel = (value: string) => (
    JIZURA_THEME_OPTIONS.find(option => option.value === value)?.label ?? value
);

/**
 * The complete style catalogue shipped by JIZURA's core and expression pack.
 * The visual treatment is still generated from all of JIZURA's layout, motion,
 * typography and decor packs; this list selects the colour/type direction.
 */
export const JIZURA_STYLE_OPTIONS: JizuraStyleOption[] = [
    { value: 'noir', label: 'Noir · 色差黑', description: '黑底、白字、青橙色差' },
    { value: 'crimson', label: 'Crimson · 深红信号', description: '深红、数据故障与双栏构图' },
    { value: 'caution', label: 'Caution · 警戒黄', description: '黄色底、计器 UI 与高对比色' },
    { value: 'magenta', label: 'Magenta · 流行洋红', description: '洋红、白色与粗圆字体' },
    { value: 'paper', label: 'Paper · 纸墨', description: '纸张质感、靛蓝与明朝字体' },
    { value: 'hud', label: 'HUD · 暗色仪表', description: '细线框架、橙色 HUD 与暗色空间' },
    { value: 'mint', label: 'Mint · 薄荷终端', description: '青绿、荧光色与终端扫描感' },
    { value: 'specimen', label: 'Specimen · 字体标本', description: '字典注释、引线与明朝字体' },
    { value: 'transit', label: 'Transit · 交通导视', description: '橄榄黄、箭头、标识与网点' },
    { value: 'blueprint', label: 'Blueprint · 蓝图', description: '鲜蓝、图形拼贴与斜向色带' },
    { value: 'rouge', label: 'Rouge · 绯红渐变', description: '灰底、红色渐变与胶囊构图' },
    { value: 'mono', label: 'Mono · RGB 单色', description: '灰阶空间、明朝字体与 RGB 分离' },
    { value: 'sakura', label: 'Sakura · 樱花', description: '和风花纹与柔和的樱色' },
    { value: 'ocean', label: 'Ocean · 深海', description: '海洋蓝、流动光线与水面感' },
    { value: 'sunset', label: 'Sunset · 日落', description: '夕阳橙、暖色渐变与长阴影' },
    { value: 'forest', label: 'Forest · 森林', description: '深绿、自然纹理与植物意象' },
    { value: 'vapor', label: 'Vapor · 蒸汽波', description: '霓虹粉蓝与复古数字感' },
    { value: 'newsprint', label: 'Newsprint · 报纸', description: '报纸网点、黑白与编辑排版' },
    { value: 'synth80', label: 'Synth 80 · 合成器', description: '紫色霓虹、网格与复古合成器' },
    { value: 'kraft', label: 'Kraft · 牛皮纸', description: '纸张、印刷与手作标签' },
    { value: 'candy', label: 'Candy · 糖果', description: '明亮糖果色与轻快图形' },
    { value: 'acid', label: 'Acid · 酸性', description: '荧光绿、黑色与强烈冲击' },
    { value: 'sumi', label: 'Sumi · 墨', description: '水墨、留白与东方笔触' },
    { value: 'gold', label: 'Gold · 金夜', description: '黑金、象牙色与金箔光泽' },
];

export const getJizuraStyleLabel = (value: string) => (
    JIZURA_STYLE_OPTIONS.find(option => option.value === value)?.label
    ?? value
);
