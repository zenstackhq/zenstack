grammar ZModel

entry Model:
    (
        datasources+=DataSource | 
        models+=DataModel | 
        enums+=Enum |
        functions+=Function |
        attributes+=Attribute
    )*;

// datasource
DataSource:
    'datasource' name=ID '{' (fields+=DataSourceField)+ '}';

DataSourceField:
    (name=ID '=' value=Expression);

// expression
Expression:
    LogicalExpr;

LiteralExpr:
    value=(BOOLEAN | NUMBER | STRING);

ArrayExpr:
    '[' (items+=Expression (',' items+=Expression)*)? ']';

type ReferenceTarget = FunctionParam | Function | DataModelField;

ReferenceExpr:
    target=[ReferenceTarget:ID];

InvocationExpr:
    function=ID '(' ArgumentList? ')';

EnumMemberExpr:
    decl=[Enum] '.' member=ID;

UnaryExpr:
    operator=('+'|'-'|'!') arg=Expression;

MultDivExpr infers Expression:
    PrimaryExpr (
        {infer BinaryExpr.left=current}
        operator=('*'|'/')
        right=PrimaryExpr
    )*;

AddSubExpr infers Expression:
    MultDivExpr (
        {infer BinaryExpr.left=current}
        operator=('+'|'-')
        right=MultDivExpr
    )*;

ComparisonExpr infers Expression:
    AddSubExpr (
        {infer BinaryExpr.left=current}
        operator=('>'|'<'|'>='|'<=')
        right=AddSubExpr
    )*;

EqualityExpr infers Expression:
    ComparisonExpr (
        {infer BinaryExpr.left=current}
        operator=('=='|'!=')
        right=ComparisonExpr
    )*;

LogicalExpr infers Expression:
    EqualityExpr (
        {infer BinaryExpr.left=current}
        operator=('&&'|'||')
        right=EqualityExpr
    )*;

PrimaryExpr infers Expression:
    '(' Expression ')' |
    LiteralExpr |
    InvocationExpr |
    ArrayExpr|
    EnumMemberExpr |
    ReferenceExpr |
    UnaryExpr;

fragment ArgumentList:
    args+=Expression (',' args+=Expression)*;

// model
DataModel:
    'model' name=ID '{' (
            fields+=DataModelField
            | attributes+=DataModelAttribute
        )+
    '}';

DataModelField:
    name=ID fieldType=DataModelFieldType (attributes+=DataModelFieldAttribute)*;

DataModelFieldType:
    (FieldType
    | reference=[TypeDeclaration:ID]
    ) (array?='[]')? (optional?='?')?;

// enum
Enum:
    'enum' name=ID '{' (fields+=EnumField)+ '}';

EnumField:
    value=ID;

// function
Function:
    'function' name=ID '(' (params+=FunctionParam (',' params+=FunctionParam)*)? ')' '{' expression=Expression '}';

FunctionParam:
    name=ID;

// attribute
Attribute:
    'attribute' name=ID '{' '}';

type TypeDeclaration = DataModel | Enum;

DataModelFieldAttribute:
    '@' decl=[Attribute] ('(' ArgumentList? ')')?;

DataModelAttribute:
    '@@' decl=[Attribute] ('(' ArgumentList? ')')?;

fragment FieldType:
    type=('String'|'Boolean'|'Int'|'Float'|'DateTime'|'JSON');

hidden terminal WS: /\s+/;
terminal BOOLEAN returns boolean: /true|false/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"[^"]*"|'[^']*'/;
terminal NUMBER returns number: /[+-]?[0-9]+(\.[0-9]+)?/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
