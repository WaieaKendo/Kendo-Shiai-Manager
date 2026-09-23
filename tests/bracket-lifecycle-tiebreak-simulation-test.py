from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app
from ksm_source import app_html

HTML=app_html()
checks=0
with sync_playwright() as p:
    browser=launch_chromium(p)
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    load_app(page, HTML)

    # Complete canonical direct-elimination templates repeatedly for split and single courts.
    for split in (False, True):
      for n in range(4,33):
        result=page.evaluate("""({n,split})=>{
          const div='Sim';
          state.divisions=[div];state.divisionTypes={[div]:'Single Elimination'};state.divisionCourts={[div]:split?'split':'A'};
          state.competitors=Array.from({length:n},(_,i)=>({name:'P'+(i+1),dojo:'D'+i,division:div,seed:i<4?String(i+1):'',status:'Checked'}));
          state.pools={};state.allMatches={};state.singleElimNodes={};state.singleElimComps={};state.teamBracketNodes={};state.teamPools={};state.brackets={};state.byeWinners={};state.currentByDivision={};
          generateDivisionState(div);
          const initial=state.allMatches[div].length;
          let guard=0;
          while(guard++<200){
            const ready=state.allMatches[div].find(m=>m.singleElim&&!m.done&&m.ready);
            if(!ready)break;
            ready.wp=['M'];ready.rp=[];ready.done=true;
            maybeAdvanceIndividualSingleElim(ready);
          }
          const beforeRepeat=state.allMatches[div].length;
          for(let i=0;i<10;i++)syncIndividualSingleElim(div,state.allMatches[div],state.singleElimComps[div]);
          const nodes=state.singleElimNodes[div];
          const ids=state.allMatches[div].filter(m=>m.singleElim).map(m=>m.elimNodeId);
          const unique=new Set(ids);
          const final=state.allMatches[div].find(m=>m.singleElim&&m.position==='Final');
          const semis=state.allMatches[div].filter(m=>m.singleElim&&m.position==='Semifinal');
          return {initial,beforeRepeat,after:state.allMatches[div].length,nodeCount:nodes.length,unique:unique.size,finalDone:!!final?.done,semis:semis.length,allDone:state.allMatches[div].filter(m=>m.singleElim&&m.ready).every(m=>m.done)};
        }""",{'n':n,'split':split})
        assert result['initial']==result['nodeCount'],(split,n,result)
        assert result['beforeRepeat']==result['initial']==result['after'],(split,n,result)
        assert result['unique']==result['nodeCount'],(split,n,result)
        assert result['finalDone'],(split,n,result)
        if n>=4: assert result['semis']==2,(split,n,result)
        checks+=5

    # Winner stop applies only to explicit two-person tiebreaks.
    rules=page.evaluate("""()=>{
      const base={division:'D',pool:'A',type:'individual',tiebreak:true};
      return {
        two:matchRequiresWinner({...base,requiresWinner:true}),
        threeLast:matchRequiresWinner({...base,requiresWinner:false,tiebreakSeries:1,tiebreakIndex:2}),
        fourLast:matchRequiresWinner({...base,requiresWinner:false,tiebreakSeries:1,tiebreakIndex:5})
      };
    }""")
    assert rules=={'two':True,'threeLast':False,'fourLast':False},rules;checks+=3

    # A fully tied three-person series creates another complete three-person series.
    tb=page.evaluate("""()=>{
      const div='Tie';
      state.divisionCourts={[div]:'A'};
      state.pools={[div]:[{label:'A',players:[{name:'A',dojo:'D'},{name:'B',dojo:'D'},{name:'C',dojo:'D'}]}]};
      state.brackets={[div]:[['A1','B2'],['B1','A2']]};
      state.allMatches={[div]:[
        {division:div,pool:'A',white:'A',red:'B',wdojo:'D',rdojo:'D',done:true,wp:['M'],rp:[],type:'individual',court:'A'},
        {division:div,pool:'A',white:'C',red:'B',wdojo:'D',rdojo:'D',done:true,wp:[],rp:['M'],type:'individual',court:'A'},
        {division:div,pool:'A',white:'C',red:'A',wdojo:'D',rdojo:'D',done:true,wp:['M'],rp:[],type:'individual',court:'A'}
      ]};
      maybeCreateTiebreaks(state.allMatches[div][2]);
      let first=state.allMatches[div].filter(m=>m.tiebreak);
      first.forEach(m=>{m.done=true;m.wp=[];m.rp=[];});
      maybeCreateTiebreaks(first[first.length-1]);
      const all=state.allMatches[div].filter(m=>m.tiebreak);
      return {count:all.length,series:[...new Set(all.map(m=>m.tiebreakSeries))],winnerFlags:all.map(m=>m.requiresWinner)};
    }""")
    assert tb['count']==6,tb
    assert tb['series']==[1,2],tb
    assert not any(tb['winnerFlags']),tb
    checks+=3

    # Four-person series allows ties and can repeat when all required seeds remain unresolved.
    four=page.evaluate("""()=>{
      const div='Four';
      state.divisionCourts={[div]:'A'};state.allMatches={[div]:[]};
      const players=['A','B','C','D'].map(name=>({name,dojo:'D',wins:0,pts:0}));
      const one=tiebreakMatchesForGroup(div,'A',players);state.allMatches[div].push(...one);
      one.forEach(m=>{m.done=true;m.wp=[];m.rp=[];});
      const two=tiebreakMatchesForGroup(div,'A',players);
      return {one:one.length,two:two.length,series:[one[0].tiebreakSeries,two[0].tiebreakSeries],hard:two.some(m=>m.requiresWinner)};
    }""")
    assert four=={'one':6,'two':6,'series':[1,2],'hard':False},four;checks+=4

    # Championship order is canonical after filtering, regardless of creation order.
    order=page.evaluate("""()=>{
      const div='Order';state.brackets={[div]:[['A1','B2'],['C1','A3'],['B1','C2'],['A2','B3']]};
      state.allMatches={[div]:[
        {division:div,type:'individual',championship:true,position:'Quarterfinal',bracketSlot:3,court:'B',white:'W4',red:'R4',done:false},
        {division:div,type:'individual',championship:true,position:'Quarterfinal',bracketSlot:2,court:'B',white:'W3',red:'R3',done:false},
        {division:div,type:'individual',championship:true,position:'Quarterfinal',bracketSlot:0,court:'A',white:'W1',red:'R1',done:false}
      ]};
      sortIndividualDivisionMatches(div,state.allMatches[div]);
      return state.allMatches[div].filter(m=>m.court==='B').map(m=>m.bracketSlot);
    }""")
    assert order==[2,3],order;checks+=1

    assert not errors,errors
    print(f'PASS: bracket lifecycle/tiebreak simulation {checks} assertions')
    browser.close()
