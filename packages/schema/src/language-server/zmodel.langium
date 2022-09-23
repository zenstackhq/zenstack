grammar ZModel

entry Model:
    (datasources+=DataSource | models+=DataModel | enums+=Enum | fragments+=Fragment )*;

// datasource
DataSource:
    'datasource' '{' (fields+=DataSourceField)+ '}';

DataSourceField:
    (name=ID '=' value=SimpleExpr);

SimpleExpr:
    SimpleInvocationExpr | LiteralExpr;

SimpleInvocationExpr:
    function=ID '(' (args+=SimpleExpr ',')* args+=SimpleExpr ')';

LiteralExpr:
    value=(BOOLEAN | INT | STRING);

// enum
Enum:
    'enum' name=ID '{' (fields+=EnumField)+ '}';

EnumField:
    value=ID;

// model
DataModel:
    'model' name=ID '{' (fragments+=FragmentExpansion)*  (fields+=DataModelField)+ '}';

FragmentExpansion:
    '...' value=[Fragment:ID];

DataModelField:
    name=ID fieldType=DataModelFieldType (attributes+=DataModelFieldAttribute)*;

DataModelFieldType:
    (FieldType
    | reference=[Declaration:ID]
    ) (array?='[]')? (optional?='?')?;

Declaration:
    DataModel | Fragment | Enum;

DataModelFieldAttribute:
    '@' name=ID 
    ('(' ((args+=LiteralExpr ',')* args+=LiteralExpr)? ')')?;

// fragment
Fragment:
    'fragment' name=ID '{' (fields+=DataModelField)+ '}';

fragment FieldType:
    type=('String'|'Boolean'|'Int'|'Float'|'DateTime'|'JSON');

hidden terminal WS: /\s+/;
terminal BOOLEAN returns boolean: /true|false/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"[^"]*"|'[^']*'/;
terminal INT returns number: /[0-9]+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
