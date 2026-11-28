"""Offline PDF layout of the HTML slides; uses bundled ReportLab and PDFium."""
from pathlib import Path
from html.parser import HTMLParser
from html import unescape
import re
import zipfile
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / 'output' / 'pdf'
SHOTS = OUT / 'slide-images'
OUT.mkdir(parents=True, exist_ok=True)
SHOTS.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('Segoe', 'C:/Windows/Fonts/segoeui.ttf'))
pdfmetrics.registerFont(TTFont('SegoeBold', 'C:/Windows/Fonts/segoeuib.ttf'))
BG, FG, MUTED, GREEN, LINE = '#0b1116', '#f2f6f8', '#9cadba', '#2ce0aa', '#2b3a43'
W, H = 1440, 810

class Node:
    def __init__(self, tag='', attrs=None):
        self.tag, self.attrs, self.children = tag, dict(attrs or []), []
    def find(self, tag=None, cls=None):
        result = []
        for child in self.children:
            if isinstance(child, Node):
                if (not tag or child.tag == tag) and (not cls or cls in child.attrs.get('class', '').split()):
                    result.append(child)
                result.extend(child.find(tag, cls))
        return result
    def text(self):
        parts = []
        for child in self.children:
            if isinstance(child, str): parts.append(child)
            elif child.tag == 'br': parts.append('\n')
            else: parts.append(child.text())
        return re.sub(r'[ \t]+', ' ', unescape(''.join(parts))).strip()

class Parser(HTMLParser):
    def __init__(self):
        super().__init__(); self.root = Node(); self.stack = [self.root]
    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs); self.stack[-1].children.append(node)
        if tag not in {'meta','link','img','br','hr','input'}: self.stack.append(node)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]; break
    def handle_data(self, data): self.stack[-1].children.append(data)

parser = Parser(); parser.feed((ROOT / 'index.html').read_text(encoding='utf-8'))
slides = parser.root.find('section', 'slide')
assert len(slides) == 7
PDF = OUT / 'ChargePilot-thuyet-trinh.pdf'
c = canvas.Canvas(str(PDF), pagesize=(W,H))
c.setTitle('ChargePilot — Giải pháp, giá trị và điểm khác biệt')
c.setAuthor('NhungAnhChang3Chan')
checks = []

def text(value, x, y, width, size=25, color=FG, bold=False, leading=None):
    font = 'SegoeBold' if bold else 'Segoe'
    leading = leading or size * 1.4
    y0 = y
    c.setFillColor(HexColor(color)); c.setFont(font, size)
    for para in value.split('\n'):
        words = para.split(); lines = []; line = ''
        for word in words:
            candidate = (line + ' ' + word).strip()
            if line and pdfmetrics.stringWidth(candidate,font,size) > width:
                lines.append(line); line = word
            else: line = candidate
        if line or not words: lines.append(line)
        for line in lines:
            c.drawString(x,H-y-size,line)
            assert pdfmetrics.stringWidth(line,font,size) <= width + 2, line
            y += leading
    checks.append((page_no, value[:40], y0, y))
    return y

def line(x,y,width,color=LINE):
    c.setStrokeColor(HexColor(color)); c.setLineWidth(1)
    c.line(x,H-y,x+width,H-y)

def image(node,x,y,height):
    path = ROOT / node.attrs['src']
    im = ImageReader(str(path)); iw, ih = im.getSize(); width = height*iw/ih
    c.drawImage(im,x,H-y-height,width,height,mask='auto')
    return width

def row(node,x,y,width,size=25,body=22):
    line(x,y,width)
    y = text(node.find('h3')[0].text(), x,y+16,width,size,bold=True)
    y = text(node.find('p')[0].text(),x,y+8,width,body,MUTED)
    return y+22

def header(slide):
    c.setFillColor(HexColor(BG)); c.rect(0,0,W,H,fill=1,stroke=0)
    text('Charge',76,45,180,25,bold=True)
    bx = 76+pdfmetrics.stringWidth('Charge','SegoeBold',25)
    text('Pilot',bx,45,100,25,GREEN,bold=True)
    label = slide.find('header')[0].children[-1].text()
    tw = pdfmetrics.stringWidth(label,'Segoe',17)
    text(label,1364-tw,49,tw+1,17,MUTED)

def footer(slide):
    value = slide.find('p','source')[0].text()
    line(76,724,1288)
    text(value,76,738,1215,14,MUTED,leading=20)
    text(f'{page_no:02}',1325,744,40,18,GREEN)

for page_no, s in enumerate(slides, 1):
    header(s)
    title = s.find('h1') or s.find('h2')
    imgs = s.find('img')
    if page_no == 1:
        text(s.find(cls='label')[0].text(),76,157,850,17,GREEN,bold=True)
        title_lines = title[0].text().split('\n')
        y=text(title_lines[0],76,203,900,66,bold=True,leading=81)
        text(title_lines[1],76,y,900,66,GREEN,bold=True)
        text(s.find('p','lead')[0].text(),76,400,800,28,MUTED)
        line(76,535,800)
        stat=s.find('div','statline')[0]
        text(stat.find('strong')[0].text(),76,563,180,52,GREEN,bold=True)
        text(stat.find('p')[0].text(),282,564,590,23)
        image(imgs[0],1030,108,590)
    elif page_no == 2:
        text(title[0].text(),76,119,1288,47,bold=True)
        labels=s.find('div','label')
        text(labels[0].text(),76,214,610,17,GREEN,bold=True)
        text(labels[1].text(),775,214,590,17,GREEN,bold=True)
        y=258
        for item in s.find('div','row'): y=row(item,76,y,603,25,22)
        text(s.find('h3')[-1].text(),775,260,580,35,bold=True,leading=48)
        text(s.find('p','muted')[-1].text(),775,396,580,25,MUTED)
        line(775,526,580,GREEN)
        text(s.find('div','callout')[0].text(),775,550,580,25)
    elif page_no == 3:
        text(title[0].text(),76,119,1288,45,bold=True)
        y=210
        for n,item in enumerate(s.find('div','step'),1):
            line(76,y,840)
            text(f'{n:02}',76,y+18,50,20,GREEN)
            y=text(item.find('h3')[0].text(),132,y+14,780,26,bold=True)
            y=text(item.find('p')[0].text(),132,y+7,780,22,MUTED)+21
        image(imgs[0],1040,198,510)
    elif page_no == 4:
        text(title[0].text(),76,119,1288,47,bold=True)
        text(s.find('p','intro')[0].text().replace(' Bấm vào ảnh để xem rõ.', ''),76,185,1288,22,MUTED)
        for n,(im,fig) in enumerate(zip(imgs,s.find('figcaption'))):
            x=110+n*326
            image(im,x,238,435)
            caption = re.sub(r'^(\d{2})(?=\S)', r'\1  ', fig.text())
            text(caption,85+n*326,686,294,21)
    elif page_no == 5:
        text(title[0].text(),76,119,1288,47,bold=True)
        text(s.find('div','big')[0].text(),76,227,600,105,GREEN,bold=True)
        text(s.find('h3')[0].text(),76,361,600,34,bold=True)
        text(s.find('p','muted')[0].text(),76,425,580,26,MUTED)
        line(76,562,590,GREEN)
        text(s.find('div','callout')[0].text(),76,587,590,24)
        y=227
        for item in s.find('div','row'): y=row(item,775,y,589,25,22)
    elif page_no == 6:
        text(title[0].text(),76,119,1288,46,bold=True)
        text('28/29',76,199,330,66,MUTED,bold=True)
        text('lượt 1 → lượt 2',385,240,320,25,MUTED)
        text('29/29',730,186,550,96,GREEN,bold=True)
        table=s.find('table')[0]
        y=347
        for ridx,tr in enumerate(table.find('tr')):
            cells=tr.find('th') or tr.find('td')
            for cell,x,width in zip(cells,[76,440,600],[340,130,130]):
                text(cell.text(),x,y,width,18 if ridx==0 else 25,MUTED if ridx==0 else FG)
            line(76,y+47,640); y+=65
        text('B13 lỗi mạng; thêm retry và siết hậu kiểm.',76,631,640,22,MUTED)
        y=344
        for item in s.find('div','row'): y=row(item,830,y,534,25,22)
        text('Bước tiếp theo: đo hiệu quả tại trạm thật.',830,y,534,22,GREEN)
    else:
        text(s.find('div','label')[0].text(),76,154,800,17,GREEN,bold=True)
        parts=title[0].text().split('\n')
        y=text(parts[0],76,201,825,55,bold=True,leading=72)
        y=text(parts[1],76,y,825,55,GREEN,bold=True,leading=72)
        y=text(s.find('p','lead')[0].text(),76,y+24,790,28,MUTED)
        line(76,y+26,790,GREEN)
        y=text(s.find('h3')[0].text(),76,y+46,790,26,bold=True)
        y=text(s.find('div','callout')[0].find('p')[0].text(),76,y+10,790,23,MUTED)
        text('Cảm ơn thầy cô và các bạn.',76,y+22,790,27,GREEN)
        image(imgs[0],966,222,400); image(imgs[1],1173,222,400)
    footer(s)
    c.showPage()
c.save()

reader=PdfReader(str(PDF))
assert len(reader.pages)==7
for page in reader.pages:
    assert abs(float(page.mediabox.width)/float(page.mediabox.height)-16/9)<0.001
    assert 'Charge' in page.extract_text()
doc=pdfium.PdfDocument(str(PDF))
thumbs=[]
for n,page in enumerate(doc):
    bitmap=page.render(scale=4/3)
    im=bitmap.to_pil().convert('RGB')
    assert im.size==(1920,1080),im.size
    im.save(SHOTS/f'slide-{n+1:02}.png')
    small=im.resize((640,360))
    thumbs.append(small)
    bitmap.close(); page.close()
doc.close()
sheet=Image.new('RGB',(1280,1440),'#19232b')
for n,im in enumerate(thumbs):sheet.paste(im,((n%2)*640,(n//2)*360))
sheet.save(OUT/'contact-sheet.png')
with zipfile.ZipFile(OUT/'ChargePilot-7-anh-slide.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
    for image_path in sorted(SHOTS.glob('slide-*.png')): z.write(image_path,image_path.name)
overflow=[item for item in checks if item[2]<724 and item[3]>716]
print({'pdf':str(PDF),'pages':len(reader.pages),'pngs':7,'png_size':'1920x1080','possible_overflow':overflow})
