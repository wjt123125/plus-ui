/**
 * 连接器运行层（万物皆包，databus-material-market.md §15）类型定义。
 * 两层状态机：market_item 管买卖，databus_connector_def 管运行（本文件）。
 * 安装语义＝enable（非 fork、不写 databus_install），启停/卸载统一走 defs 端点。
 */

/** 运行层状态机（def 行） */
export type ConnectorDefStatus = 'INACTIVE' | 'ENABLED' | 'DISABLED' | 'DEPRECATED';

/** def 来源（MARKET / UPLOAD / AI / ADMIN / DEV） */
export type ConnectorDefSource = 'MARKET' | 'UPLOAD' | 'AI' | 'ADMIN' | 'DEV';

/**
 * 运行态健康（派生字段，后端内存现算不落库）。
 * 与 status 是两件事：status 说「治理上该不该跑」，health 说「实际跑起来没有、驱动在不在包里」。
 * OK＝实例在跑且驱动由包内提供；MISSING_DRIVER＝驱动缺失或落到了平台那份；NOT_LOADED＝运行中没有实例。
 */
export type ConnectorHealth = 'OK' | 'MISSING_DRIVER' | 'NOT_LOADED';

/** SELECT 候选项（与后端 ConnectorDescriptor.Option 对齐） */
export interface ConnectorFieldOption {
  /** 展示文案 */
  label?: string;
  /** 提交值 */
  value?: string;
}

/**
 * 字段条件显示规则（与后端 ConnectorDescriptor.ShowWhen 逐字对齐）。
 * eq/ne/in/notIn 同时给多条时为 AND；前端只在规则全满足时渲染该字段。
 */
export interface ConnectorShowWhen {
  /** 依据字段名（相对同一层配置对象，支持点路径） */
  field?: string;
  eq?: string | null;
  ne?: string | null;
  in?: string[] | null;
  notIn?: string[] | null;
}

/**
 * 连接器配置字段（连接表单动态渲染，§15.1 前端直渲）。
 * 与后端 org.dromara.databus.connector.ConnectorDescriptor.ConfigField 一一对应；
 * 连接表单不写死任何字段，控件形态、必填、联动、分组全部由这份 schema 决定。
 */
export interface ConnectorConfigField {
  /** 字段类型：string / int / long / boolean / double / array / object */
  type?: string;
  /** 展示标签 */
  label?: string;
  /** 是否必填 */
  required?: boolean;
  /** 默认值（type 决定形态：string / number / boolean / array / object） */
  defaultValue?: unknown;
  /** SELECT 候选值 */
  options?: ConnectorFieldOption[] | null;
  /** 说明（表单项下方小灰字） */
  description?: string;
  /**
   * 是否敏感字段（密码 / token / secret）。
   * 双重语义：前端渲染密码框 + 编辑态留空即沿用库中旧值（后端不回显、缺省自动补齐）。
   */
  sensitive?: boolean;
  /** 控件类型：TEXT / TEXTAREA / NUMBER / BOOLEAN / SELECT / PASSWORD / KEY_VALUE_MAP；空则由 type 推断 */
  widget?: string;
  /** 占位提示 */
  placeholder?: string | null;
  /** 条件显示规则（满足才渲染；被隐藏的字段不参与必填校验） */
  showWhen?: ConnectorShowWhen | null;
  /** 分组（"基础" / "高级"，连接表单据此分 tab） */
  group?: string | null;
}

/**
 * 连接器操作（组件物料生成用），与后端 ConnectorDescriptor.OperationDef 对齐。
 */
export interface ConnectorOperationDef {
  /** 操作名（与 Connector 业务方法名对应） */
  name?: string;
  /** 展示标签 */
  label?: string;
  /** LiteFlow 组件注册名（与 cmp-defs id 一致） */
  componentId?: string;
  /** 操作入参字段清单（key=字段名，value=字段定义） */
  params?: Record<string, ConnectorConfigField>;
  /** 操作产出字段名（写入数据空间 $.&lt;tag&gt;.* 的字段） */
  outputs?: string[];
}

/**
 * 连接器 def 视图行（GET /databus/connector/defs）：连接器零内置，只返回 def 行。
 */
export interface ConnectorDefVo {
  /** 主键 id */
  id?: string | number;
  /** 类型键（全局唯一；连接管理页 connectorType 引用此值） */
  type: string;
  /** 版本号（manifest 声明） */
  version?: string;
  /** 引擎档（http / jvm / native） */
  engine?: 'http' | 'jvm' | 'native' | string;
  /** 展示标签（manifest / descriptor 的 label） */
  label?: string;
  /** 图标名（Iconify 字符串） */
  icon?: string;
  /** 运行层状态（INACTIVE / ENABLED / DISABLED / DEPRECATED） */
  status: ConnectorDefStatus | string;
  /**
   * 运行态健康（派生，不落库）。配色规则：status≠ENABLED 一律灰；
   * ENABLED 再按 health 分绿（OK）/ 黄（MISSING_DRIVER）/ 红（NOT_LOADED）。
   */
  health?: ConnectorHealth | string;
  /** 不健康时的具体原因（人话，可直接显示）；health=OK 时为空 */
  healthReason?: string;
  /** 来源（MARKET / UPLOAD / AI / ADMIN / DEV） */
  source?: ConnectorDefSource | string;
  /** 信任档（审批人审核时勾选，§1.3；true 放开试连异常回显与私网豁免） */
  verified?: boolean;
  /** zip 落盘目录（plugins/{type}/{version}） */
  packagePath?: string;
  /** 操作清单（组件物料生成用） */
  operations?: ConnectorOperationDef[];
  /** Connection 配置 schema（连接表单动态渲染；字段名 → 字段定义） */
  configSchema?: Record<string, ConnectorConfigField>;
  createBy?: string | number;
  /** 上架者登录名（后端反查 market_item.owner_code；没上架过的连接器为空，前端不渲染 @作者） */
  ownerCode?: string;
  createTime?: string;
  updateTime?: string;
}

/**
 * 运行时驱动行（§4.2.1，后端 PluginManager.collectDrivers() 逐字段对齐）。
 * 行内键是 `type`（连接器类型键）而不是 dbType —— 对 JDBC 连接器这个值就是库种（jdbc-postgresql），
 * 前端不另造名字，照后端原样收。
 * SPI 声明了但类不在包里时 `loadedFrom` 为 null 且带 `error`：包打漏了驱动，
 * 这正是要暴露的故障，不是可以吞掉的异常，所以类型里保留 error。
 */
export interface ConnectorRuntimeDriver {
  /** 连接器类型键（jdbc-postgresql 等） */
  type?: string;
  /** 驱动类全限定名（META-INF/services/java.sql.Driver 声明） */
  driverClass?: string;
  /** 驱动 jar 的 Implementation-Version（诊断接口故意不初始化驱动类，故不是 getDriverVersion()） */
  version?: string | null;
  /** PLUGIN＝包内那份生效（正常）/ PLATFORM＝父加载器那份生效（配置事故）/ null＝类没加载上 */
  loadedFrom?: 'PLUGIN' | 'PLATFORM' | null;
  /** 实际加载器的 toString */
  classLoader?: string | null;
  /** 加载失败原因（ClassNotFoundException / LinkageError 的 toString） */
  error?: string | null;
}

/**
 * 运行时信息（GET /databus/connector/{type}/runtime-info 的 data）。
 * 连接器未装载时 classLoader 为 null、drivers 为空数组（接口本身不报错）。
 */
export interface ConnectorRuntimeInfo {
  /** 连接器类型键 */
  type?: string;
  /** 当前生效加载器标识：PluginClassLoader[{type}/{version}]；未装载为 null */
  classLoader?: string | null;
  /** 生效驱动清单 */
  drivers?: ConnectorRuntimeDriver[];
}

/**
 * 包内单个文件概要（审核「看得见」§2.3：先看清单，再看实现 jar 的常量池扫描结果）。
 */
export interface ConnectorPackageFile {
  /** 文件相对路径（manifest.json / lib/xxx.jar 等） */
  name?: string;
  /** 体积（字节） */
  size?: number;
  /** 条目类型：manifest（manifest.json）/ jar / other */
  kind?: string;
  /** 是否实现 jar（含 manifest 声明 mainClass 的 jar，仅这类做常量池扫描） */
  mainJar?: boolean;
  /** class 文件数（jar 才有） */
  classes?: number;
  /** 实现 jar 的 class 清单（第三方驱动 jar 不返回） */
  classList?: string[];
  /** jar 内 META-INF/MANIFEST.MF 快照文本（截断 2048 字符） */
  manifest?: string;
}

/**
 * 包内清单 + 实现 jar 可疑 API 扫描结果（GET .../package-files）。
 * 「机器先扫」：suspicious 是实现 jar 常量池命中的可疑 API 描述符，供审核者参考，非阻断。
 */
export interface ConnectorPackageInspect {
  /** 类型键（全局唯一） */
  type?: string;
  /** 版本号 */
  version?: string;
  /** 引擎档（http / jvm / native） */
  engine?: string;
  /** 实现类全限定名 */
  mainClass?: string;
  /** 包内文件清单 */
  files?: ConnectorPackageFile[];
  /** 可疑 API 描述符（java/io/*、java/net/*、反射、进程、类加载器等黑名单命中） */
  suspicious?: string[];
}
