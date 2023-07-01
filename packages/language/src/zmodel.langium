grammar ZModel


entry Model:
    imports+=ModelImport*
    (
        declarations+=AbstractDeclaration
    )*;

ModelImport:
    'import' path=STRING  ';'?;

AbstractDeclaration:
    DataSource | GeneratorDecl| Plugin | DataModel | Enum | FunctionDecl | Attribute;

// datasource
DataSource:
    TRIPLE_SLASH_COMMENT* 'datasource' name=RegularID '{' (fields+=DataSourceField)* '}';

DataSourceField:
    TRIPLE_SLASH_COMMENT* name=RegularID '=' value=(LiteralExpr | InvocationExpr | ArrayExpr);

// generator
GeneratorDecl:
    TRIPLE_SLASH_COMMENT* 'generator' name=RegularID '{' (fields+=GeneratorField)* '}';

GeneratorField:
    TRIPLE_SLASH_COMMENT* name=RegularID '=' value=(LiteralExpr | ArrayExpr);

// plugin
Plugin:
    TRIPLE_SLASH_COMMENT* 'plugin' name=RegularID '{' (fields+=PluginField)* '}';

PluginField:
    TRIPLE_SLASH_COMMENT* name=RegularID '=' value=(LiteralExpr | ArrayExpr | ObjectExpr);

// expression
Expression:
    LogicalExpr;

LiteralExpr:
    value=(Boolean | NUMBER | STRING);

ArrayExpr:
    '[' (items+=Expression (',' items+=Expression)*)? ']';

type ReferenceTarget = FunctionParam | DataModelField | EnumField;

ThisExpr:
    value=THIS;

NullExpr:
    value=NULL;

ReferenceExpr:
    target=[ReferenceTarget:RegularID] ('(' ReferenceArgList ')')?;

fragment ReferenceArgList:
    args+=ReferenceArg (',' args+=ReferenceArg)*;

ReferenceArg:
    name=('sort') ':' value=('Asc' | 'Desc');


ObjectExpr:
    '{'
        (fields+=FieldInitializer (',' fields+=FieldInitializer)* ','?)?
    '}';

FieldInitializer:
    name=RegularID ':' value=(Expression);

InvocationExpr:
    function=[FunctionDecl] '(' ArgumentList? ')';

// binary operator precedence follow Javascript's rules:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence#table

MemberAccessExpr infers Expression:
    PrimaryExpr (
        {infer MemberAccessExpr.operand=current}
        ('.' member=[DataModelField])
    )*;

UnaryExpr:
    operator=('!') operand=MemberAccessExpr;

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

InExpr infers Expression:
    CollectionPredicateExpr (
        {infer BinaryExpr.left=current}
        operator=('in')
        right=CollectionPredicateExpr
    )*;

ComparisonExpr infers Expression:
    InExpr (
        {infer BinaryExpr.left=current}
        operator=('>'|'<'|'>='|'<=')
        right=InExpr
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
    UnaryExpr |
    InvocationExpr |
    ArrayExpr|
    ReferenceExpr |
    ObjectExpr;

fragment ArgumentList:
    args+=Argument (',' args+=Argument)*;

Argument:
    (name=RegularID ':')? value=Expression;

// model
DataModel:
    (comments+=TRIPLE_SLASH_COMMENT)*
    (isAbstract?='abstract')? 'model' name=RegularID  
    ('extends' superTypes+=[DataModel] (',' superTypes+=[DataModel])*)? '{' (
        fields+=DataModelField
            | attributes+=DataModelAttribute
        )+
    '}';

DataModelField:
    (comments+=TRIPLE_SLASH_COMMENT)*
    name=RegularID type=DataModelFieldType (attributes+=DataModelFieldAttribute)*;

DataModelFieldType:
    (type=BuiltinType | unsupported=UnsupportedFieldType | reference=[TypeDeclaration:RegularID]) (array?='[' ']')? (optional?='?')?;

UnsupportedFieldType:
    'Unsupported' '(' (value=LiteralExpr) ')';

// enum
Enum:
    (comments+=TRIPLE_SLASH_COMMENT)*
    'enum' name=RegularID '{' (
           fields+=EnumField
           | attributes+=DataModelAttribute
        )+ 
    '}';

EnumField:
    (comments+=TRIPLE_SLASH_COMMENT)*
    name=RegularID (attributes+=DataModelFieldAttribute)*;

// function
FunctionDecl:
    TRIPLE_SLASH_COMMENT* 'function' name=RegularID '(' (params+=FunctionParam (',' params+=FunctionParam)*)? ')' ':' returnType=FunctionParamType '{' (expression=Expression)? '}' (attributes+=InternalAttribute)*;

FunctionParam:
    TRIPLE_SLASH_COMMENT* name=RegularID ':' type=FunctionParamType (optional?='?')?;

FunctionParamType:
    (type=ExpressionType | reference=[TypeDeclaration:RegularID]) (array?='[' ']')?;

QualifiedName returns string:
    // TODO: is this the right way to deal with token precedence?
    ID ('.' (ID|BuiltinType))*;

// https://github.com/langium/langium/discussions/1012
RegularID returns string:
    // include keywords that we'd like to work as ID in most places
    ID | 'model' | 'enum' | 'attribute' | 'datasource' | 'plugin' | 'abstract' | 'in' | 'sort';

// internal attribute
InternalAttributeName returns string:
    '@@@' QualifiedName;

// model-level attribute
DataModelAttributeName returns string:
    '@@' QualifiedName;

// field-level attribute
DataModelFieldAttributeName returns string:
    '@' QualifiedName;

AttributeName returns string:
    DataModelAttributeName | DataModelFieldAttributeName | InternalAttributeName;

// attribute
Attribute:
    TRIPLE_SLASH_COMMENT* 'attribute' name=AttributeName '(' (params+=AttributeParam (',' params+=AttributeParam)*)? ')' (attributes+=InternalAttribute)*;

AttributeParam:
    TRIPLE_SLASH_COMMENT* (default?='_')? name=RegularID ':' type=AttributeParamType;

// FieldReference refers to fields declared in the current model
// TransitiveFieldReference refers to fields declared in the model type of the current field
AttributeParamType:
    (type=(ExpressionType | 'FieldReference' | 'TransitiveFieldReference' | 'ContextType') | reference=[TypeDeclaration:RegularID]) (array?='[' ']')? (optional?='?')?;

type TypeDeclaration = DataModel | Enum;

DataModelFieldAttribute:
    decl=[Attribute:DataModelFieldAttributeName] ('(' AttributeArgList? ')')?;

DataModelAttribute:
    TRIPLE_SLASH_COMMENT* decl=[Attribute:DataModelAttributeName] ('(' AttributeArgList? ')')?;

InternalAttribute:
    decl=[Attribute:InternalAttributeName] ('(' AttributeArgList? ')')?;

fragment AttributeArgList:
    args+=AttributeArg (',' args+=AttributeArg)*;

AttributeArg:
    (name=RegularID ':')? value=Expression;

ExpressionType returns string:
    'String' | 'Int' | 'Float' | 'Boolean' | 'DateTime' | 'Null' | 'Object' | 'Any' | 'Unsupported';

BuiltinType returns string:
    'String' | 'Boolean' | 'Int' | 'BigInt' | 'Float' | 'Decimal' | 'DateTime' | 'Json' | 'Bytes';

Boolean returns boolean:
    'true' | 'false';

hidden terminal WS: /\s+/;
terminal NULL: 'null';
terminal THIS: 'this';
terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"[^"]*"|'[^']*'/;
terminal NUMBER returns number: /[+-]?[0-9]+(\.[0-9]+)?/;
terminal TRIPLE_SLASH_COMMENT: /\/\/\/[^\n\r]*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
