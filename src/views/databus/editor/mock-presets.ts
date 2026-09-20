/**
 * 画布示例数据。
 *
 * 每个示例返回 CmpProperty 树，由 useElTreeModel.loadFromCmpProperty 解析为
 * ElNode 模型树，再投影为画布平级节点图；坐标交给 dagre 自动排列。
 *
 * 标识规则（2026-09-16 修订）：
 * - leaf.id 是组件注册名（httpRequest/condition/setValue/fieldMap/response，可重复）
 * - leaf.properties.tag 是数据空间名（httpRequest1、condition1，画布唯一）
 * - 布尔条件件 type 为 NodeBooleanComponent，其余业务件为 NodeComponent
 *
 * 可试运行性：有入参依赖的示例在 inputJson 提供入参 JSON，打开试运行弹窗时自动预填，
 * 无需手敲；标注「结构展示」的示例含本档不可执行的算子
 * （SWITCH/FOR/ITERATOR/AND/OR/NOT/CHAIN），仅用于验证画布投影。
 *
 * desc 硬约束（新增示例同样遵守）：
 * - 一句话只说「演示什么」，中文不超过 25 字左右，示例列表里一眼可读；
 * - 不写操作步骤、入参解释、配套示例用法、危险警告——这些放 build 内注释或 inputJson；
 * - 结构类示例统一以「（结构展示）」结尾；可试运行的不标。
 */
import type { CmpProperty } from '@/api/databus/el/types';

export interface MockPreset {
  key: string;
  name: string;
  desc: string;
  /** 示例入参 JSON 字符串，试运行弹窗打开时预填 requestJson；无入参依赖的示例不填 */
  inputJson?: string;
  build: () => CmpProperty;
}

/**
 * 构造业务叶子。
 * @param code      组件注册名（CmpProperty.id）
 * @param dataSpace 数据空间名（properties.tag），如 httpRequest1
 * @param cfg       组件配置（对象自动 JSON.stringify；字符串原样放入 data）
 * @param asBoolean 是否为布尔条件件（NodeBooleanComponent）
 */
function leaf(code: string, dataSpace: string, cfg?: unknown, asBoolean = false): CmpProperty {
  const node: CmpProperty = {
    id: code,
    type: asBoolean ? 'NodeBooleanComponent' : 'NodeComponent',
    properties: { tag: dataSpace }
  };
  if (cfg !== undefined) {
    node.properties!.data = typeof cfg === 'string' ? cfg : JSON.stringify(cfg);
  }
  return node;
}

/** IF 双分支包一层：真分支多节点时用 THEN 包裹 */
function thenWrap(...children: CmpProperty[]): CmpProperty {
  return { type: 'THEN', children };
}

export const MOCK_PRESETS: MockPreset[] = [
  {
    key: 'script-if-booleanScript',
    name: '条件脚本与脚本（纯本地）',
    desc: 'Groovy 脚本读写数据空间与 IF 条件脚本（结构展示）',
    inputJson: '{"flag":true,"name":"databus"}',
    // 结构：THEN( IF(booleanScript1, THEN(script1), setValue1) )
    // - booleanScript1 读 $.flag，返回 boolean 决定 IF 走真分支
    // - 真分支 THEN(script1)：读 $.name 拼 greeting 写回 $.script1.greeting
    // - 假分支 setValue1：仅占位
    // 注：脚本叶子 serializeNode 已对 script/booleanScript 特例——序列化时 CmpProperty.id
    //     替换为数据空间名（cmpId），后端 EL 引用与 LiteFlowNodeBuilder 注册一致。
    build: () => ({
      type: 'THEN',
      children: [
        {
          type: 'IF',
          condition: leaf(
            'booleanScript',
            'booleanScript1',
            {
              language: 'groovy',
              script: "def v = databusContext.read('$.flag'); return v == true"
            },
            true
          ),
          children: [
            thenWrap(
              leaf('script', 'script1', {
                language: 'groovy',
                script:
                  "def name = databusContext.read('$.name'); databusContext.save('$.script1.greeting', 'hello ' + name)"
              })
            ),
            leaf('setValue', 'setValue1', { path: '$.response1.msg', value: '已完成' })
          ]
        }
      ]
    })
  },
  // ── HTTP 完善档：免授权双请求（本地 RuoYi 一键运行，无需登录/加密开关） ──
  // 节点1 GET /auth/code：CaptchaController @SaIgnore 无 @ApiEncrypt，恒返回 JSON 信封
  //   data.captchaEnabled 必在；data.uuid 在验证码开关关闭时为 null → required:false
  // 节点2 GET /：IndexController 免授权，返回纯文本（非 JSON），response 原样存字符串
  // 注：RuoYi 的 POST 免登录接口（/auth/login、/auth/register）全部挂 @ApiEncrypt，
  //     裸 HTTP 无法演示；POST(form/json/raw) 与 basic/bearer 的配置模板见属性面板占位。
  {
    key: 'http-anonymous-chain',
    name: 'HTTP 免授权双请求（本地 RuoYi）',
    desc: '免授权免加密：JSON 抽取 + 纯文本响应',
    inputJson: '{}',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('httpRequest', 'httpRequest1', {
          method: 'GET',
          url: 'http://localhost:8080/auth/code',
          mappings: [
            { field: 'captchaEnabled', path: '$.data.captchaEnabled' },
            { field: 'uuid', path: '$.data.uuid', required: false }
          ]
        }),
        leaf('httpRequest', 'httpRequest2', {
          method: 'GET',
          url: 'http://localhost:8080/',
          headers: { 'X-Demo': 'databus' }
        })
      ]
    })
  },

  // ── BPM 业务主线（需 BPM 环境可试运行） ──
  // 顺序锁定：会话 → 启流程 → 建 BO → 完任务
  // 依据旧系统 ProcessCreateProcessor.save("result.processInstanceId") 在前、
  //       BoCreateProcessor 的 method=create 必须 bindId 指向流程实例 ID 在后
  // （BO 需绑定到已存在的流程实例，bindId 必须是 $.processStart1.processInstanceId 动态引用）
  {
    key: 'bpm-flow',
    name: 'BPM 全链路（需 BPM 环境）',
    desc: '会话→启流程→建 BO→附件上传/读回→完任务',
    inputJson: '{"request":{"password":"mlhg2004.3401","code":"D001","boList":[{"BO_FIELD_TEXT":"测试","BO_FIELD_USER":"张三","BO_FIELD_NUM":123456}],"files":[{"fileName":"hello.txt","fileContent":"aGVsbG8gZGF0YWJ1cw==","securityLevel":1}]}}',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('sessionCreate', 'sessionCreate1', {
          connectionId: 'bpm-default',
          userName: 'admin',
          password: '$.request.password'
        }),
        leaf('processStart', 'processStart1', {
          connectionId: 'bpm-default',
          processDefId: 'obj_61a4e68a43e043fa87f89530a503f9ae',
          uid: 'admin',
          title: '申请-${$.request.code}'
        }),
        leaf('boCreate', 'boCreate1', {
          connectionId: 'bpm-default',
          method: 'create',
          // bindId 引用上一步 processStart 产出的流程实例 ID
          // （旧系统 BoCreateProcessor method=create 时 bindId 必填，指向流程实例 ID）
          bindId: '$.processStart1.processInstanceId',
          uid: 'admin',
          boList: [
            {
              boName: 'BO_EU_API_TEST_MAIN',
              sourcePath: '$.request.boList',
              rewrite: { strategy: 'all', path: '$.response.boList' }
            }
          ]
        }),
        // 附件两件：boId 取新建记录 ID（创建响应已回写，无需再 query），
        // 同时透传流程实例 ID；fileDownload 读回验证上传生效，预期 fileCount=1
        leaf('fileUpload', 'fileUpload1', {
          connectionId: 'bpm-default',
          sourcePath: '$.request.files',
          boId: '$.boCreate1.boResults[0].records[0].ID',
          appId: 'com.awspaas.user.apps.data.bus',
          boName: 'BO_EU_API_TEST_MAIN',
          boItemName: 'BO_FIELD_FILE',
          processInstId: '$.processStart1.processInstanceId'
        }),
        leaf('fileDownload', 'fileDownload1', {
          connectionId: 'bpm-default',
          boId: '$.boCreate1.boResults[0].records[0].ID',
          fieldName: 'BO_FIELD_FILE'
        }),
        leaf('taskComplete', 'taskComplete1', {
          connectionId: 'bpm-default',
          processInstanceId: '$.processStart1.processInstanceId',
          uid: 'admin',
          failOnError: false
        })
      ]
    })
  },
  {
    key: 'bpm-bo-update',
    name: 'BPM BO 查改验证（需 BPM 环境）',
    desc: '按查询结果分流：有数据则改并验证，无则跳过',
    inputJson: '{"request":{"password":"mlhg2004.3401","newUser":"张三-已更新","conditions":[{"fieldName":"BO_FIELD_TEXT","operator":"=","paramValue":"测试"}]}}',
    build: () => ({
      type: 'THEN',
      // 数据保留不删；清理测试数据请加载「BPM BO 条件清理」示例
      // IF 条件检 $.boQuery1.records[0]：空数组越界触发 PathNotFoundException，
      // readOptional 兜底返 null → notBlank=false；命中首条返回 Map，toString 非空 → true
      children: [
        leaf('sessionCreate', 'sessionCreate1', {
          connectionId: 'bpm-default',
          userName: 'admin',
          password: '$.request.password'
        }),
        leaf('boQuery', 'boQuery1', {
          connectionId: 'bpm-default',
          main: {
            boName: 'BO_EU_API_TEST_MAIN',
            method: 'list',
            maxRecord: 10,
            // 条件列表从入参动态读取（fieldName/operator/paramValue/valid）
            conditionSourcePath: '$.request.conditions'
          }
        }),
        {
          type: 'IF',
          condition: leaf(
            'condition',
            'hasData1',
            { path: '$.boQuery1.records[0]', op: 'notBlank' },
            true
          ),
          children: [
            thenWrap(
              leaf('dataPatch', 'dataPatch1', {
                // 原地给查出的每条记录打补丁：只改 USER 字段，ID/TEXT 等其余字段原样保留
                // 改 USER 不改查询条件里的 TEXT，保证二次同条件查询仍能命中
                target: '$.boQuery1.records[*]',
                patch: { BO_FIELD_USER: '$.request.newUser' }
              }),
              leaf('boUpdate', 'boUpdate1', {
                connectionId: 'bpm-default',
                // records 已被 dataPatch 原地打补丁，每条仍含 ID，整体回写
                boList: [{ boName: 'BO_EU_API_TEST_MAIN', sourcePath: '$.boQuery1.records' }]
              }),
              leaf('boQuery', 'boQuery2', {
                connectionId: 'bpm-default',
                // 二次查询验证：返回记录的 BO_FIELD_USER 应为入参 newUser；数据保留不删
                main: {
                  boName: 'BO_EU_API_TEST_MAIN',
                  method: 'list',
                  maxRecord: 10,
                  conditionSourcePath: '$.request.conditions'
                }
              })
            ),
            leaf('response', 'response1', { result: false, msg: '查询无数据，已跳过更新' })
          ]
        }
      ]
    })
  },
  {
    key: 'bpm-bo-delete',
    name: 'BPM BO 条件清理（需 BPM 环境）',
    desc: '按条件查出记录并按 ID 批量删除',
    inputJson: '{"request":{"password":"mlhg2004.3401","conditions":[{"fieldName":"BO_FIELD_TEXT","operator":"=","paramValue":"测试"}]}}',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('sessionCreate', 'sessionCreate1', {
          connectionId: 'bpm-default',
          userName: 'admin',
          password: '$.request.password'
        }),
        leaf('boQuery', 'boQuery1', {
          connectionId: 'bpm-default',
          main: {
            boName: 'BO_EU_API_TEST_MAIN',
            method: 'list',
            maxRecord: 50,
            // 条件范围决定删除范围，试运行前可先只保留查询节点确认 records
            conditionSourcePath: '$.request.conditions'
          }
        }),
        leaf('boDelete', 'boDelete1', {
          connectionId: 'bpm-default',
          method: 'remove',
          // 按查出记录的 ID 删除
          boList: [{ boName: 'BO_EU_API_TEST_MAIN', sourcePath: '$.boQuery1.records' }]
        })
      ]
    })
  },
  {
    key: 'bpm-rds-methods',
    name: 'BPM SQL 八方法全覆盖（需 BPM 环境）',
    desc: '临时表自清理，覆盖查询写入与批量两种模式',
    // MySQL 方言；rdsId 必须与 BPM 后台「注册数据源」ID 一致
    inputJson: '{"request":{"password":"mlhg2004.3401"}}',
    build: () => ({
      type: 'THEN',
      // 自清理可重复跑：首节点 DROP IF EXISTS + 建表，尾节点 DROP；
      // 中途失败时 DATABUS_RDS_TEST 保留供排查，下次试运行首节点自动清掉。
      // 预期观测：标量四件 data 为 张三/25/3/12000.75；getMap 单行、getMaps 三行；
      // update 影响行数 1；batch 批量参数 [1,1,1]、多 SQL [1,1]；末尾验证查询剩 2 行
      children: [
        leaf('sessionCreate', 'sessionCreate1', {
          connectionId: 'bpm-default',
          userName: 'admin',
          password: '$.request.password'
        }),
        // 0. 清理上次残留 + 建临时表（DDL 走 update 方法）
        leaf('rdsExecute', 'rdsExecute1', {
          connectionId: 'bpm-default',
          rdsId: '3ed8f0e7-d7fc-451c-b73c-301a6f22fcea',
          method: 'update',
          sql: 'drop table if exists DATABUS_RDS_TEST'
        }),
        leaf('rdsExecute', 'rdsExecute2', {
          connectionId: 'bpm-default',
          rdsId: '3ed8f0e7-d7fc-451c-b73c-301a6f22fcea',
          method: 'update',
          sql: 'create table DATABUS_RDS_TEST (ID varchar(32) not null primary key, NAME varchar(64), AGE int, SALARY decimal(10,2))'
        }),
        // 1. batch 模式二：单 SQL + 批量参数（DynamicBatchSetter），插 3 行 → [1,1,1]
        leaf('rdsExecute', 'rdsExecute3', {
          connectionId: 'bpm-default',
          rdsId: '3ed8f0e7-d7fc-451c-b73c-301a6f22fcea',
          method: 'batch',
          sql: 'insert into DATABUS_RDS_TEST (ID, NAME, AGE, SALARY) values (?, ?, ?, ?)',
          // args 数组的数组：每行一组参数，叶子走统一参数解析（常量原样、数字不转字符串）
          args: [
            ['t1', '张三', 30, 8800.5],
            ['t2', '李四', 25, 7600],
            ['t3', '王五', 41, 12000.75]
          ]
        }),
        // 2. getString → 张三
        leaf('rdsExecute', 'rdsExecute4', {
          connectionId: 'bpm-default',
          rdsId: '3ed8f0e7-d7fc-451c-b73c-301a6f22fcea',
          method: 'getString',
          sql: 'select NAME from DATABUS_RDS_TEST where ID = ?',
          args: ['t1']
        }),
        // 3. getInt → 25
        leaf('rdsExecute', 'rdsExecute5', {
          connectionId: 'bpm-default',
          rdsId: '3ed8f0e7-d7fc-451c-b73c-301a6f22fcea',
          method: 'getInt',
          sql: 'select AGE from DATABUS_RDS_TEST where ID = ?',
          args: ['t2']
        }),
        // 4. getLong → 3
        leaf('rdsExecute', 'rdsExecute6', {
          connectionId: 'bpm-default',
          rdsId: '3ed8f0e7-d7fc-451c-b73c-301a6f22fcea',
          method: 'getLong',
          sql: 'select count(*) from DATABUS_RDS_TEST'
        }),
        // 5. getDouble → 12000.75
        leaf('rdsExecute', 'rdsExecute7', {
          connectionId: 'bpm-default',
          rdsId: '3ed8f0e7-d7fc-451c-b73c-301a6f22fcea',
          method: 'getDouble',
          sql: 'select SALARY from DATABUS_RDS_TEST where ID = ?',
          args: ['t3']
        }),
        // 6. getMap → 单行 Map
        leaf('rdsExecute', 'rdsExecute8', {
          connectionId: 'bpm-default',
          rdsId: '3ed8f0e7-d7fc-451c-b73c-301a6f22fcea',
          method: 'getMap',
          sql: 'select ID, NAME, AGE, SALARY from DATABUS_RDS_TEST where ID = ?',
          args: ['t1']
        }),
        // 7. getMaps → 3 行
        leaf('rdsExecute', 'rdsExecute9', {
          connectionId: 'bpm-default',
          rdsId: '3ed8f0e7-d7fc-451c-b73c-301a6f22fcea',
          method: 'getMaps',
          sql: 'select ID, NAME, AGE, SALARY from DATABUS_RDS_TEST order by ID'
        }),
        // 8. update 单条参数化 → 影响行数 1
        leaf('rdsExecute', 'rdsExecute10', {
          connectionId: 'bpm-default',
          rdsId: '3ed8f0e7-d7fc-451c-b73c-301a6f22fcea',
          method: 'update',
          sql: 'update DATABUS_RDS_TEST set NAME = ? where ID = ?',
          args: ['张三-改', 't1']
        }),
        // 9. batch 模式一：多 SQL 无参（update + delete 各一条）→ [1,1]
        leaf('rdsExecute', 'rdsExecute11', {
          connectionId: 'bpm-default',
          rdsId: '3ed8f0e7-d7fc-451c-b73c-301a6f22fcea',
          method: 'batch',
          sql: [
            "update DATABUS_RDS_TEST set AGE = AGE + 1 where ID = 't2'",
            "delete from DATABUS_RDS_TEST where ID = 't3'"
          ]
        }),
        // 10. 写后验证：剩 2 行，t1 改名、t2 年龄 +1
        leaf('rdsExecute', 'rdsExecute12', {
          connectionId: 'bpm-default',
          rdsId: '3ed8f0e7-d7fc-451c-b73c-301a6f22fcea',
          method: 'getMaps',
          sql: 'select ID, NAME, AGE, SALARY from DATABUS_RDS_TEST order by ID'
        }),
        // 11. 尾清理
        leaf('rdsExecute', 'rdsExecute13', {
          connectionId: 'bpm-default',
          rdsId: '3ed8f0e7-d7fc-451c-b73c-301a6f22fcea',
          method: 'update',
          sql: 'drop table DATABUS_RDS_TEST'
        })
      ]
    })
  },
  {
    key: 'bpm-idcard-to-userid',
    name: 'BPM 身份证换用户（需 BPM 环境）',
    desc: '逗号分隔身份证号批量换 userId 原地写回',
    // idCards/idCardsPartial 第一项须替换为 ORGUSER.EXT1 真实身份证号；
    // 试运行后两个路径分别写回：全命中 userId 串 / 部分命中 userId（后端 warn 漏掉项）
    inputJson: '{"request":{"password":"mlhg2004.3401","idCards":"522121199701255412","idCardsPartial":"522121199701255412,34010119900202002X"}}',
    build: () => ({
      type: 'THEN',
      // 一个节点两字段覆盖两场景：idCards 全命中→写回 userId；
      // idCardsPartial 一真一假→后端 warn 未匹配项，写回命中的 userId
      // （全未命中必抛错中断，无法同链，见「身份证全未命中」示例）
      children: [
        leaf('sessionCreate', 'sessionCreate1', {
          connectionId: 'bpm-default',
          userName: 'admin',
          password: '$.request.password'
        }),
        leaf('idCardToUserId', 'idCardToUserId1', {
          connectionId: 'bpm-default',
          fields: [
            { path: '$.request.idCards', separator: ',' },
            { path: '$.request.idCardsPartial', separator: ',' }
          ]
        })
      ]
    })
  },
  {
    key: 'bpm-idcard-all-miss',
    name: 'BPM 身份证全未命中（需 BPM 环境）',
    desc: '全部身份证查无用户，节点预期抛错中断',
    // 两个均为不存在的假号；预期链路在 idCardToUserId1 失败，错误信息含「均未匹配」
    inputJson: '{"request":{"password":"mlhg2004.3401","idCards":"34010119900202002X,999999999999999999"}}',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('sessionCreate', 'sessionCreate1', {
          connectionId: 'bpm-default',
          userName: 'admin',
          password: '$.request.password'
        }),
        leaf('idCardToUserId', 'idCardToUserId1', {
          connectionId: 'bpm-default',
          fields: [{ path: '$.request.idCards', separator: ',' }]
        })
      ]
    })
  },
  {
    key: 'local-flag',
    name: '入参开关（纯本地，无外部依赖）',
    desc: '按入参 flag 真假写不同赋值',
    inputJson: '{"flag":true}',
    build: () => ({
      type: 'IF',
      condition: leaf('condition', 'condition1', { path: '$.flag', op: 'isTrue' }, true),
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: 'flag 为真' }),
        leaf('setValue', 'setValue2', { path: '$.setValue2.out', value: 'flag 为假' })
      ]
    })
  },

  // ── 串行 ──
  {
    key: 'serial-all',
    name: '串行 THEN',
    desc: '请求→赋值→映射→响应四类真组件串联',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('httpRequest', 'httpRequest1', { method: 'GET', url: 'http://localhost:8080/auth/code' }),
        leaf('setValue', 'setValue1', { path: '$.setValue1.note', value: '串行演示' }),
        leaf('fieldMap', 'fieldMap1', {
          mappings: [
            { from: '$.httpRequest1.response.code', to: '$.fieldMap1.code' }
          ]
        }),
        leaf('response', 'response1', {
          result: true,
          msg: '$.httpRequest1.response.msg',
          dataPath: '$.fieldMap1'
        })
      ]
    })
  },
  {
    key: 'then-empty',
    name: '空 THEN 占位',
    desc: '空 children 验证占位节点与 start 连边（结构展示）',
    build: () => ({ type: 'THEN', children: [] })
  },

  // ── 并行 ──
  {
    key: 'when-parallel',
    name: '并行 WHEN',
    desc: '三路赋值并行，验证扇出扇入与 junction 多入边',
    build: () => ({
      type: 'WHEN',
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: '并行 A' }),
        leaf('setValue', 'setValue2', { path: '$.setValue2.out', value: '并行 B' }),
        leaf('setValue', 'setValue3', { path: '$.setValue3.out', value: '并行 C' })
      ]
    })
  },

  // ── 条件 ──
  {
    key: 'if-branch',
    name: '条件 IF 双分支',
    desc: '按入参 code 是否等于 200 走不同赋值',
    inputJson: '{"code":200}',
    build: () => ({
      type: 'IF',
      condition: leaf(
        'condition',
        'condition1',
        { path: '$.code', op: 'eq', value: 200 },
        true
      ),
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.result', value: 'code 命中' }),
        leaf('setValue', 'setValue2', { path: '$.setValue2.result', value: 'code 未命中' })
      ]
    })
  },
  {
    key: 'if-empty-false',
    name: 'IF 空假分支',
    desc: '只有真分支，假分支为占位节点',
    inputJson: '{"flag":true}',
    build: () => ({
      type: 'IF',
      condition: leaf('condition', 'condition1', { path: '$.flag', op: 'isTrue' }, true),
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: '真分支执行' })
      ]
    })
  },

  // ── 选择（本档不可试运行，结构展示） ──
  {
    key: 'switch-multi',
    name: '选择 SWITCH 三 case',
    desc: '三 case 分支，验证多 outlet 菱形与 junction（结构展示）',
    build: () => ({
      type: 'SWITCH',
      condition: leaf('setValue', 'setValue0', { path: '$.setValue0.switchOn', value: '占位' }),
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: 'case1' }),
        leaf('setValue', 'setValue2', { path: '$.setValue2.out', value: 'case2' }),
        leaf('setValue', 'setValue3', { path: '$.setValue3.out', value: 'case3' })
      ]
    })
  },

  // ── 循环 ──
  {
    key: 'for-loop',
    name: 'FOR 循环',
    desc: '验证循环网关与 DO 出口（结构展示）',
    build: () => ({
      type: 'FOR',
      condition: leaf('setValue', 'setValue0', { path: '$.setValue0.for', value: '占位' }),
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: '循环体' })
      ]
    })
  },
  {
    key: 'while-loop',
    name: 'WHILE 循环（零次执行安全示例）',
    desc: '条件为假时循环体零次执行',
    inputJson: '{"flag":false}',
    build: () => ({
      type: 'WHILE',
      // 警告：flag=true 会死循环，禁止试运行
      condition: leaf('condition', 'condition1', { path: '$.flag', op: 'isTrue' }, true),
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: '循环体执行' })
      ]
    })
  },
  {
    key: 'iterator-loop',
    name: 'ITERATOR 迭代',
    desc: '验证迭代器网关（结构展示）',
    build: () => ({
      type: 'ITERATOR',
      condition: leaf('setValue', 'setValue0', { path: '$.setValue0.iter', value: '占位' }),
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: '迭代体' })
      ]
    })
  },

  // ── 异常 ──
  {
    key: 'catch-flow',
    name: 'CATCH 异常捕获（真触发异常分支）',
    desc: '请求不存在端口触发异常，响应组件兜底',
    build: () => ({
      type: 'CATCH',
      children: [
        leaf('httpRequest', 'httpRequest1', {
          method: 'GET',
          url: 'http://127.0.0.1:9999/no-such-service'
        }),
        leaf('response', 'response1', { result: false, msg: '下游不可用，已兜底' })
      ]
    })
  },
  {
    key: 'catch-empty',
    name: 'CATCH 空异常槽',
    desc: '仅正常主体，异常槽为占位节点',
    build: () => ({
      type: 'CATCH',
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: '正常执行' })
      ]
    })
  },

  // ── 逻辑（布尔编排需配合 IF 使用，本档仅结构展示） ──
  {
    key: 'and-logic',
    name: 'AND 与逻辑',
    desc: '两个布尔条件取与（结构展示）',
    build: () => ({
      type: 'AND',
      // 建议入参 {"a":true,"b":true}；通常嵌在 IF 条件位使用
      children: [
        leaf('condition', 'condition1', { path: '$.a', op: 'isTrue' }, true),
        leaf('condition', 'condition2', { path: '$.b', op: 'isTrue' }, true)
      ]
    })
  },
  {
    key: 'or-logic',
    name: 'OR 或逻辑',
    desc: '两个布尔条件取或（结构展示）',
    build: () => ({
      type: 'OR',
      // 建议入参 {"a":false,"b":true}
      children: [
        leaf('condition', 'condition1', { path: '$.a', op: 'isTrue' }, true),
        leaf('condition', 'condition2', { path: '$.b', op: 'isTrue' }, true)
      ]
    })
  },
  {
    key: 'not-logic',
    name: 'NOT 非逻辑',
    desc: '对布尔条件取反（结构展示）',
    build: () => ({
      type: 'NOT',
      // 建议入参 {"flag":false}
      children: [
        leaf('condition', 'condition1', { path: '$.flag', op: 'isTrue' }, true)
      ]
    })
  },

  // ── 子流程 ──
  {
    key: 'chain-ref',
    name: 'CHAIN 子流程引用',
    desc: '引用子链 subChain_demo（结构展示）',
    build: () => ({
      type: 'THEN',
      // 前提：subChain_demo 已在 chainMap 中存在
      children: [
        { id: 'subChain_demo', type: 'NodeComponent', properties: { tag: 'subChain_demo' } }
      ]
    })
  },

  // ── 嵌套综合 ──
  {
    key: 'nested-complex',
    name: '嵌套综合',
    desc: 'THEN(赋值, IF(flag 双分支), WHEN(并行两路))',
    inputJson: '{"flag":true}',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('setValue', 'setValue0', { path: '$.setValue0.out', value: '串行头' }),
        {
          type: 'IF',
          condition: leaf('condition', 'condition1', { path: '$.flag', op: 'isTrue' }, true),
          children: [
            leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: 'IF 真' }),
            leaf('setValue', 'setValue2', { path: '$.setValue2.out', value: 'IF 假' })
          ]
        },
        {
          type: 'WHEN',
          children: [
            leaf('setValue', 'setValue3', { path: '$.setValue3.out', value: '并行 A' }),
            leaf('setValue', 'setValue4', { path: '$.setValue4.out', value: '并行 B' })
          ]
        }
      ]
    })
  },
  {
    key: 'nested-catch-in-then',
    name: 'THEN 内嵌 CATCH（正常路径）',
    desc: 'THEN 内嵌 CATCH，异常槽不触发',
    build: () => ({
      type: 'THEN',
      children: [
        leaf('setValue', 'setValue1', { path: '$.setValue1.out', value: '串行头' }),
        {
          type: 'CATCH',
          children: [
            leaf('setValue', 'setValue2', { path: '$.setValue2.out', value: 'try 主体' }),
            leaf('response', 'response1', { result: false, msg: '进入异常处理' })
          ]
        },
        leaf('response', 'response2', { result: true, msg: '主流程完成' })
      ]
    })
  }
];

export function getMockPreset(key: string): MockPreset | undefined {
  return MOCK_PRESETS.find((preset) => preset.key === key);
}
