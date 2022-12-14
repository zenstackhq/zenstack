grammar ZModel

entry Model:
    (
        declarations+=AbstractDeclaration
    )*;

AbstractDeclaration:
    DataSource | DataModel | Enum | Function | Attribute;

// datasource
DataSource:
    'datasource' name=ID '{' (fields+=DataSourceField)* '}';

DataSourceField:
    (name=ID '=' value=(LiteralExpr|InvocationExpr));

// expression
Expression:
    LogicalExpr;

LiteralExpr:
    value=(BOOLEAN | NUMBER | STRING);

ArrayExpr:
    '[' (items+=Expression (',' items+=Expression)*)? ']';

type ReferenceTarget = FunctionParam | DataModelField | EnumField;

ThisExpr:
    value=THIS;

NullExpr:
    value=NULL;

ReferenceExpr:
    target=[ReferenceTarget:ID] ('(' ReferenceArgList ')')?;

fragment ReferenceArgList:
    args+=ReferenceArg (',' args+=ReferenceArg)*;

ReferenceArg:
    name=('sort') ':' value=('Asc'| 'Desc');

InvocationExpr:
    function=[Function] '(' ArgumentList? ')';

UnaryExpr:
    operator=('!') operand=Expression;

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
        operator=('?'|'!'|'^')
        '[' right=Expression ']'
    )*;

// TODO: support arithmetics?
//
// MultDivExpr infers Expression:
//     CollectionPredicateExpr (
//         {infer BinaryExpr.left=current}
//         operator=('*'|'/')
//         right=CollectionPredicateExpr
//     )*;

// AddSubExpr infers Expression:
//     MultDivExpr (
//         {infer BinaryExpr.left=current}
//         operator=('+'|'-')
//         right=MultDivExpr
//     )*;

ComparisonExpr infers Expression:
    CollectionPredicateExpr (
        {infer BinaryExpr.left=current}
        operator=('>'|'<'|'>='|'<=')
        right=CollectionPredicateExpr
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
    NullExpr |
    LiteralExpr |
    InvocationExpr |
    ArrayExpr|
    ReferenceExpr |
    UnaryExpr;

fragment ArgumentList:
    args+=Argument (',' args+=Argument)*;

Argument:
    (name=ID ':')? value=Expression;

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
    (type=BuiltinType | reference=[TypeDeclaration:ID]) (array?='[]')? (optional?='?')?;

// enum
Enum:
    'enum' name=ID '{' (fields+=EnumField)+ '}';

EnumField:
    name=ID;

// function
Function:
    'function' name=ID '(' (params+=FunctionParam (',' params+=FunctionParam)*)? ')' ':' returnType=FunctionParamType '{' (expression=Expression)? '}';

FunctionParam:
    name=ID ':' type=FunctionParamType;

FunctionParamType:
    (type=ExpressionType | reference=[TypeDeclaration]) (array?='[]')?;

// attribute-level attribute
AttributeAttributeName returns string:
    '@@@' ID;

// model-level attribute
DataModelAttributeName returns string:
    '@@' ID;

// field-level attribute
DataModelFieldAttributeName returns string:
    '@' ID;

AttributeName returns string:
    DataModelAttributeName | DataModelFieldAttributeName | AttributeAttributeName;

// attribute
Attribute:
    'attribute' name=AttributeName '(' (params+=AttributeParam (',' params+=AttributeParam)*)? ')' (attributes+=AttributeAttribute)*;

AttributeParam:
    (default?='_')? name=ID ':' type=AttributeParamType;

AttributeParamType:
    (type=(ExpressionType | 'FieldReference' | 'ContextType') | reference=[TypeDeclaration:ID]) (array?='[]')? (optional?='?')?;

type TypeDeclaration = DataModel | Enum;

DataModelFieldAttribute:
    decl=[Attribute:DataModelFieldAttributeName] ('(' AttributeArgList? ')')?;

DataModelAttribute:
    decl=[Attribute:DataModelAttributeName] ('(' AttributeArgList? ')')?;

AttributeAttribute:
    decl=[Attribute:AttributeAttributeName] ('(' AttributeArgList? ')')?;

fragment AttributeArgList:
    args+=AttributeArg (',' args+=AttributeArg)*;

AttributeArg:
    (name=ID ':')? value=Expression;

ExpressionType returns string:
    'String' | 'Int' | 'Float' | 'Boolean' | 'DateTime' | 'Null' | 'Any';

BuiltinType returns string:
    'String'|'Boolean'|'Int'|'BigInt'|'Float'|'Decimal'|'DateTime'|'Json'|'Bytes';

hidden terminal WS: /\s+/;
terminal BOOLEAN returns boolean: /true|false/;
terminal NULL: 'null';
terminal THIS: 'this';
terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"[^"]*"|'[^']*'/;
terminal NUMBER returns number: /[+-]?[0-9]+(\.[0-9]+)?/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
