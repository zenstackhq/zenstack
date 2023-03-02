grammar ZModel

entry Model:
    (
        declarations+=AbstractDeclaration
    )*;

AbstractDeclaration:
    DataSource | GeneratorDecl| Plugin | DataModel | Enum | FunctionDecl | Attribute;

// datasource
DataSource:
    TRIPLE_SLASH_COMMENT* 'datasource' name=ID '{' (fields+=DataSourceField)* '}';

DataSourceField:
    TRIPLE_SLASH_COMMENT* name=ID '=' value=(LiteralExpr|InvocationExpr);

// generator
GeneratorDecl:
    TRIPLE_SLASH_COMMENT* 'generator' name=ID '{' (fields+=GeneratorField)* '}';

GeneratorField:
    TRIPLE_SLASH_COMMENT* name=ID '=' value=(LiteralExpr | ArrayExpr);

// plugin
Plugin:
    TRIPLE_SLASH_COMMENT* 'plugin' name=ID '{' (fields+=PluginField)* '}';

PluginField:
    TRIPLE_SLASH_COMMENT* name=ID '=' value=(LiteralExpr | ArrayExpr);

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
    name=('sort') ':' value=('Asc' | 'Desc');

InvocationExpr:
    function=[FunctionDecl] '(' ArgumentList? ')';

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
    (comments+=TRIPLE_SLASH_COMMENT)*
    'model' name=ID '{' (
            fields+=DataModelField
            | attributes+=DataModelAttribute
        )+
    '}';

DataModelField:
    (comments+=TRIPLE_SLASH_COMMENT)*
    name=ID type=DataModelFieldType (attributes+=DataModelFieldAttribute)*;

DataModelFieldType:
    (type=BuiltinType | reference=[TypeDeclaration:ID]) (array?='[' ']')? (optional?='?')?;

// enum
Enum:
    (comments+=TRIPLE_SLASH_COMMENT)*
    'enum' name=ID '{' (
           fields+=EnumField
           | attributes+=DataModelAttribute
        )+ 
    '}';

EnumField:
    (comments+=TRIPLE_SLASH_COMMENT)*
    name=ID (attributes+=DataModelFieldAttribute)*;

// function
FunctionDecl:
    TRIPLE_SLASH_COMMENT* 'function' name=ID '(' (params+=FunctionParam (',' params+=FunctionParam)*)? ')' ':' returnType=FunctionParamType '{' (expression=Expression)? '}';

FunctionParam:
    TRIPLE_SLASH_COMMENT* name=ID ':' type=FunctionParamType;

FunctionParamType:
    (type=ExpressionType | reference=[TypeDeclaration]) (array?='[' ']')?;

QualifiedName returns string:
    ID ('.' ID)*;

// attribute-level attribute
AttributeAttributeName returns string:
    '@@@' QualifiedName;

// model-level attribute
DataModelAttributeName returns string:
    '@@' QualifiedName;

// field-level attribute
DataModelFieldAttributeName returns string:
    '@' QualifiedName;

AttributeName returns string:
    DataModelAttributeName | DataModelFieldAttributeName | AttributeAttributeName;

// attribute
Attribute:
    TRIPLE_SLASH_COMMENT* 'attribute' name=AttributeName '(' (params+=AttributeParam (',' params+=AttributeParam)*)? ')' (attributes+=AttributeAttribute)*;

AttributeParam:
    TRIPLE_SLASH_COMMENT* (default?='_')? name=ID ':' type=AttributeParamType;

// FieldReference refers to fields declared in the current model
// TransitiveFieldReference refers to fields declared in the model type of the current field
AttributeParamType:
    (type=(ExpressionType | 'FieldReference' | 'TransitiveFieldReference' | 'ContextType') | reference=[TypeDeclaration:ID]) (array?='[' ']')? (optional?='?')?;

type TypeDeclaration = DataModel | Enum;

DataModelFieldAttribute:
    decl=[Attribute:DataModelFieldAttributeName] ('(' AttributeArgList? ')')?;

DataModelAttribute:
    TRIPLE_SLASH_COMMENT* decl=[Attribute:DataModelAttributeName] ('(' AttributeArgList? ')')?;

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
terminal TRIPLE_SLASH_COMMENT: /\/\/\/[^\n\r]*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
