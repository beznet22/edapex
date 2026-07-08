    
```
    (Parent Rounded Corner)                                         (Parent Rounded Corner)                                    
     .------------------------------------------------------------------------------------. 
    /  Access [M↓] ~/Workspace/smscore/docs/architecture.md?     [ Deny ] [ Validate ^]    \ ---------> ActionBar 
   | .------------------------------------------------------------------------------------. |
   |/ (Input Top Rounded Corner)                                 (Input Top Rounded Corner)\|
   | |Ask anything, @ to mention, / for workflows |                                         |
   |                                                                                        |  -------->ChatComposer
   |                                                                                        |
   | + mic-icon |                                                                    [■]    |
    \                                                                                      /
     '------------------------------------------------------------------------------------' 
   (Shared Bottom/Input Corner)                                (Shared Bottom/Input Corner)

```


**Reference behavior** (from user-provided descriptions):

```
                                                             
   ┌──────────────────────────────────────────────────────────┐  
   │  ┌──────────┐                                            │  
   │  │Large     │  ============   (loading skeleton bars)    │  
   │  │File Icon │  ============                              │  
   │  │Tilted 10°│  "You'll be informed immediately..."       │  
   │  └──────────┘ (changing info - filename, timestamp, etc) │  
   │                                                          |
   │  [====skeleton====]                 (eye preview icon)   │ 
   └──────────────────────────────────────────────────────────┘  

   ┌──────────────────────────────────────────────────────────┐  
   │  ┌──────────┐                                            │  
   │  │ Document │   Artifacts                  (done title)  │  
   │  │  mock    │   filename.md                              │  
   │  └──────────┘                                            │  
   │                                                          │  
   │  22/05/2026 10:25                   (eye preview icon)   │  
   └──────────────────────────────────────────────────────────┘ 
```
