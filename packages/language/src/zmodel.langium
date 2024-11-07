grammar ZModel


entry Model:
    imports+=ModelImport*
    (
        declarations+=AbstractDeclaration
    )*;

ModelImport:
    'import' path=STRING  ';'?;

AbstractDeclaration:
    DataSource | GeneratorDecl| Plugin | DataModel | TypeDef | Enum | FunctionDecl | Attribute;

// datasource
DataSource:
    TRIPLE_SLASH_COMMENT* 'datasource' name=RegularID '{' (fields+=ConfigField)* '}';

// generator
GeneratorDecl:
    TRIPLE_SLASH_COMMENT* 'generator' name=RegularID '{' (fields+=ConfigField)* '}';

ConfigField:
    TRIPLE_SLASH_COMMENT* name=RegularID '=' value=ConfigExpr;

// plugin
Plugin:
    TRIPLE_SLASH_COMMENT* 'plugin' name=RegularID '{' (fields+=PluginField)* '}';

PluginField:
    TRIPLE_SLASH_COMMENT* name=RegularID '=' value=(LiteralExpr | ArrayExpr | ObjectExpr);

// expression
Expression:
    LogicalExpr;

NumberLiteral:
    value=NUMBER;

StringLiteral:
    value=STRING;

BooleanLiteral:
    value=Boolean;

LiteralExpr:
    NumberLiteral | StringLiteral | BooleanLiteral;

ArrayExpr:
    '[' (items+=Expression (',' items+=Expression)*)? ']';

ConfigInvocationExpr:
    name=ID ('(' ConfigInvocationArgList? ')')?;

fragment ConfigInvocationArgList:
    args+=ConfigInvocationArg (',' args+=ConfigInvocationArg)*;

ConfigInvocationArg:
    name=ID ':' value=LiteralExpr;

ConfigArrayExpr:
    '[' (items+=(LiteralExpr|ConfigInvocationExpr) (',' items+=(LiteralExpr|ConfigInvocationExpr))*)? ']';

// expressions used in configuration fields (e.g. datasource, generator, plugin)
ConfigExpr:
    LiteralExpr | InvocationExpr | ConfigArrayExpr;

type ReferenceTarget = FunctionParam | DataModelField | EnumField;
ThisExpr:
    value='this';

NullExpr:
    value='null';

ReferenceExpr:
    target=[ReferenceTarget:RegularIDWithTypeNames] ('(' ReferenceArgList ')')?;

fragment ReferenceArgList:
    args+=ReferenceArg (',' args+=ReferenceArg)*;

ReferenceArg:
    name=ID ':' value=Expression;


ObjectExpr:
    '{'
        (fields+=FieldInitializer (',' fields+=FieldInitializer)* ','?)?
    '}';

FieldInitializer:
    name=(RegularID | STRING) ':' value=(Expression);

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
    value=Expression;

// model
DataModel:
    (comments+=TRIPLE_SLASH_COMMENT)*
    (
        ((isAbstract?='abstract')? 'model' name=RegularID  
            ('extends' superTypes+=[DataModel] (',' superTypes+=[DataModel])*)?) |
        ((isView?='view') name=RegularID)
    )
    '{' (
        fields+=DataModelField
            | attributes+=DataModelAttribute
        )*
    '}';

DataModelField:
    (comments+=TRIPLE_SLASH_COMMENT)*
    name=RegularIDWithTypeNames type=DataModelFieldType (attributes+=DataModelFieldAttribute)*;

DataModelFieldType:
    (type=BuiltinType | unsupported=UnsupportedFieldType | reference=[TypeDeclaration:RegularID]) (array?='[' ']')? (optional?='?')?;

TypeDef:
    (comments+=TRIPLE_SLASH_COMMENT)*
    'type' name=RegularID '{' (
           fields+=TypeDefField
        )*
    '}';

type TypeDefFieldTypes = TypeDef | Enum;

TypeDefField:
    (comments+=TRIPLE_SLASH_COMMENT)*   
    name=RegularIDWithTypeNames type=TypeDefFieldType (attributes+=DataModelFieldAttribute)*;

TypeDefFieldType:
    (type=BuiltinType | reference=[TypeDefFieldTypes:RegularID]) (array?='[' ']')? (optional?='?')?;

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
    name=RegularIDWithTypeNames (attributes+=DataModelFieldAttribute)*;

// function
FunctionDecl:
    TRIPLE_SLASH_COMMENT* 'function' name=RegularID '(' (params+=FunctionParam (',' params+=FunctionParam)*)? ')' ':' returnType=FunctionParamType '{' (expression=Expression)? '}' (attributes+=InternalAttribute)*;

FunctionParam:
    TRIPLE_SLASH_COMMENT* name=RegularID ':' type=FunctionParamType (optional?='?')?;

FunctionParamType:
    (type=ExpressionType | reference=[TypeDeclaration:RegularID]) (array?='[' ']')?;

// https://github.com/langium/langium/discussions/1012
RegularID returns string:
    // include keywords that we'd like to work as ID in most places
    ID | 'model' | 'enum' | 'attribute' | 'datasource' | 'plugin' | 'abstract' | 'in' | 'view' | 'import' | 'type';

RegularIDWithTypeNames returns string:
    RegularID | 'String' | 'Boolean' | 'Int' | 'BigInt' | 'Float' | 'Decimal' | 'DateTime' | 'Json' | 'Bytes' | 'Null' | 'Object' | 'Any' | 'Unsupported';

// attribute
Attribute:
    (comments+=TRIPLE_SLASH_COMMENT)* 'attribute' name=(INTERNAL_ATTRIBUTE_NAME|MODEL_ATTRIBUTE_NAME|FIELD_ATTRIBUTE_NAME) '(' (params+=AttributeParam (',' params+=AttributeParam)*)? ')' (attributes+=InternalAttribute)*;

AttributeParam:
    (comments+=TRIPLE_SLASH_COMMENT)* (default?='_')? name=RegularID ':' type=AttributeParamType (attributes+=InternalAttribute)*;

// FieldReference refers to fields declared in the current model
// TransitiveFieldReference refers to fields declared in the model type of the current field
AttributeParamType:
    (type=(ExpressionType | 'FieldReference' | 'TransitiveFieldReference' | 'ContextType') | reference=[TypeDeclaration:RegularID]) (array?='[' ']')? (optional?='?')?;

type TypeDeclaration = DataModel | TypeDef | Enum;
DataModelFieldAttribute:
    decl=[Attribute:FIELD_ATTRIBUTE_NAME] ('(' AttributeArgList? ')')?;

DataModelAttribute:
    TRIPLE_SLASH_COMMENT* decl=[Attribute:MODEL_ATTRIBUTE_NAME] ('(' AttributeArgList? ')')?;

InternalAttribute:
    decl=[Attribute:INTERNAL_ATTRIBUTE_NAME] ('(' AttributeArgList? ')')?;

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
terminal INTERNAL_ATTRIBUTE_NAME: /@@@([_a-zA-Z][\w_]*\.)*[_a-zA-Z][\w_]*/;
terminal MODEL_ATTRIBUTE_NAME: /@@([_a-zA-Z][\w_]*\.)*[_a-zA-Z][\w_]*/;
terminal FIELD_ATTRIBUTE_NAME: /@([_a-zA-Z][\w_]*\.)*[_a-zA-Z][\w_]*/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;
terminal NUMBER: /[+-]?[0-9]+(\.[0-9]+)?/;
terminal TRIPLE_SLASH_COMMENT: /\/\/\/[^\n\r]*/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
