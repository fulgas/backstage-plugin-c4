grammar StructurizrDSL;

workspace
    : 'workspace' STRING? STRING? block EOF
    ;

block
    : '{' statement* '}'
    ;

statement
    : modelBlock
    | viewsBlock
    | assignment
    | anonymousElement
    | relationship
    | viewDecl
    ;

modelBlock
    : 'model' block
    ;

viewsBlock
    : 'views' block
    ;

assignment
    : IDENTIFIER '=' elementDecl
    ;

elementDecl
    : personDecl
    | softwareSystemDecl
    ;

anonymousElement
    : personDecl
    | softwareSystemDecl
    ;

personDecl
    : 'person' STRING STRING?
    ;

softwareSystemDecl
    : 'softwareSystem' STRING STRING? ('{' containerStatement* '}')?
    ;

containerStatement
    : containerDecl
    | relationship
    ;

containerDecl
    : IDENTIFIER '=' 'container' STRING STRING? STRING?
    ;

relationship
    : IDENTIFIER '->' IDENTIFIER STRING? STRING?
    ;

viewDecl
    : systemContextView
    | containerView
    ;

systemContextView
    : 'systemContext' IDENTIFIER STRING? block?
    ;

containerView
    : 'container' IDENTIFIER STRING? block?
    ;

STRING          : '"' (~["\r\n])* '"' ;
IDENTIFIER      : [a-zA-Z_][a-zA-Z0-9_]* ;
WS              : [ \t\r\n]+ -> skip ;
LINE_COMMENT    : '//' ~[\r\n]* -> skip ;
BLOCK_COMMENT   : '/*' .*? '*/' -> skip ;
