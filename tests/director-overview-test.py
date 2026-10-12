from pathlib import Path
from playwright.sync_api import sync_playwright
from ksm_browser import launch_chromium, load_app
HTML=(Path(__file__).resolve().parents[1]/'public'/'index.html').read_text()
with sync_playwright() as p:
 b=launch_chromium(p)
 page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 load_app(page, HTML)
 page.evaluate("""
 state.allMatches={Test:[
 {division:'Test',pool:'A',white:'W1',red:'R1',done:true,wp:['M'],rp:[]},
 {division:'Test',pool:'A',white:'W2',red:'R2',done:false,wp:[],rp:[]},
 {division:'Test',pool:'A',white:'W3',red:'R3',done:false,wp:[],rp:[]},
 {division:'Test',pool:'A',white:'W4',red:'R4',done:false,wp:[],rp:[]}
 ]};state.divisionCourts={Test:'A'};state.courtState.A={division:'Test',index:1};state.courtState.B={division:null,index:0};renderDirector();document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));document.querySelector('#director').classList.remove('hidden');
 """)
 assert page.locator('#directorOverallCount').inner_text()=='1 / 4 Matches'
 assert page.locator('.director-court-card').first.locator('.director-division').inner_text()=='Test'
 rows=page.locator('.director-court-card').first.locator('.director-match-row')
 assert rows.nth(0).inner_text().find('W2')>=0
 assert rows.nth(1).inner_text().find('W3')>=0
 assert rows.nth(2).inner_text().find('W4')>=0
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 assert not errors,errors
 print('PASS: Director overview 6/6 assertions')
 b.close()
