grammar ZModel

entry Model:
    (
        declarations+=AbstractDeclaration
    )*;

AbstractDeclaration:
    DataSource | DataModel | Enum | Function | Attribute;

// datasource
DataSource:
    'datasource' name=ID '{' (fields+=DataSourceField)+ '}';

DataSourceField:
    (name=ID '=' value=(LiteralExpr|InvocationExpr));

// expression
Expression:
    LogicalExpr;

LiteralExpr:
    value=(BOOLEAN | INT | STRING | NULL);

ArrayExpr:
    '[' (items+=Expression (',' items+=Expression)*)? ']';

type ReferenceTarget = FunctionParam | DataModelField | EnumField;

ThisExpr:
    value=THIS;

ReferenceExpr:
    target=[ReferenceTarget:ID];

InvocationExpr:
    function=[Function] '(' ArgumentList? ')';

UnaryExpr:
    operator=('+'|'-'|'!') arg=Expression;

// binary operator precedence follow Javascript's rules:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence#table

MemberAccessExpr infers Expression:
    PrimaryExpr (
        {infer MemberAccessExpr.operand=current}
        ('.' member=[DataModelField])
    )*;

CollectionPredicateExpr infers Expression:
    MemberAccessExpr (
        {infer BinaryExpr.left=current}
        operator=('?'|'!')
        '[' right=Expression ']'
    )*;

MultDivExpr infers Expression:
    CollectionPredicateExpr (
        {infer BinaryExpr.left=current}
        operator=('*'|'/')
        right=CollectionPredicateExpr
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
    ThisExpr |
    LiteralExpr |
    InvocationExpr |
    ArrayExpr|
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
    name=ID type=DataModelFieldType (attributes+=DataModelFieldAttribute)*;

DataModelFieldType:
    (BuiltinType | reference=[TypeDeclaration:ID]) (array?='[]')? (optional?='?')?;

// enum
Enum:
    'enum' name=ID '{' (fields+=EnumField)+ '}';

EnumField:
    name=ID;

// function
Function:
    'function' name=ID '(' (params+=FunctionParam (',' params+=FunctionParam)*)? ')' returnType=FunctionParamType '{' (expression=Expression)? '}';

FunctionParam:
    name=ID type=FunctionParamType;

FunctionParamType:
    (BuiltinType | reference=[TypeDeclaration:ID]) (array?='[]')?;

// attribute
Attribute:
    'attribute' name=ID '(' (params+=FunctionParam (',' params+=FunctionParam)*)? ')';

type TypeDeclaration = DataModel | Enum;

DataModelFieldAttribute:
    '@' decl=[Attribute] ('(' ArgumentList? ')')?;

DataModelAttribute:
    '@@' decl=[Attribute] ('(' ArgumentList? ')')?;

fragment BuiltinType:
    type=('String'|'Boolean'|'Int'|'DateTime'|'JSON');

// QualifiedName returns string:
//     ID ('.' ID)*;

hidden terminal WS: /\s+/;
terminal BOOLEAN returns boolean: /true|false/;
terminal NULL: 'null';
terminal THIS: 'this';
terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"[^"]*"|'[^']*'/;
terminal INT returns number: /[+-]?[0-9]+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
