
var URL_LEVEL = 'Ad'; // or Keyword
var ONLY_ACTIVE = true; // set to false to check keywords or ads in all campaigns (paused and active)
var CAMPAIGN_LABEL = ''; // set this if you want to only check campaigns with this label
var STRIP_QUERY_STRING = false; // set this to false if UTM tags are important
var WRAPPED_URLS = false; // set this to true if you use a 3rd party like Marin or Kenshoo for managing your account
// This is the specific text (or texts) to search for 
// on the page that indicates the item 
// is out of stock. If ANY of these match the html
// on the page, the item is considered "out of stock"
var OUT_OF_STOCK_TEXTS = [
  'discontinued',
  'SOLD OUT',
  'Back-Ordered'
];
var PRODUCT_PAGE_EXTENSION = '/product/' //optional - set this to the directory all product pages are kept in
var CHECK_IDENTIFIERS = [ //the list of element classes or IDs that house availability info
  'pricing-availability-desc'
]
var DISCONTINUED_CHECK = [ //required if certain availability values are kept in elements with separate classes/identifiers
'discontinued_text'
]

//necessary to mark off ads/keywords after they've been checked by script.
//must be in the account prior to running the script. will throw error
var CHECK_LABEL = 'Product_Ad_Script_Check' 
var PAUSED_LABEL = 'Paused - OOS'
var LABELS = [
  CHECK_LABEL,
  PAUSED_LABEL
]
var failedPages = []


function main() {
  Logger.log('initalized')
  var alreadyCheckedUrls = {};
  
  for (var i in LABELS) {
    var labelCheck = AdsApp.labels().withCondition('Name CONTAINS "' + LABELS[i] + '"').get()
    if (labelCheck.totalNumEntities() === 0) {
      AdsApp.createLabel(LABELS[i]);
    }
  }
  
  
  var iter = buildSelector().get();
  
  if (!iter.hasNext()) {
    AdsApp.labels().withCondition('Name CONTAINS "' + CHECK_LABEL + '"').get().next().remove();
    AdsApp.createLabel(CHECK_LABEL);
    iter = buildSelector().get();
  }
  
  while(iter.hasNext()) {
    var entity = iter.next();
    var urls = [];
    if(entity.urls().getFinalUrl()) {
      urls.push(entity.urls().getFinalUrl());
    }
    if(entity.urls().getMobileFinalUrl()) {
      urls.push(entity.urls().getMobileFinalUrl());
    }
    for(var i in urls) {
      var url = cleanUrl(urls[i]);
      if(alreadyCheckedUrls[url] === undefined) {
        alreadyCheckedUrls[url] = getAvailabilityStrings(url);
      }
      
      entity.applyLabel(CHECK_LABEL);
      
      switch (alreadyCheckedUrls[url]) {
        case 'valueError':
          break;
        case 'notFound':
          break;
        case 'siteLoadError':
          Logger.log('siteLoadError: ' + url);
          break;
        case 'Online Exclusive': //will likely have to delete for other clients
          entity.enable();
          entity.removeLabel(PAUSED_LABEL);
          break;
        case 'pause':
          entity.pause();
          entity.applyLabel(PAUSED_LABEL);
          break;
        case 'enable':
          entity.enable();
          entity.removeLabel(PAUSED_LABEL);
          break;
        default:
          if (alreadyCheckedUrls[url].indexOf('In Stock') > -1) {
            entity.enable()
            entity.removeLabel(PAUSED_LABEL)
            alreadyCheckedUrls[url] = 'enable'
          }
          
          for (x in OUT_OF_STOCK_TEXTS) {
            if (alreadyCheckedUrls[url].indexOf(OUT_OF_STOCK_TEXTS[x]) > -1) {
              entity.pause()
              entity.applyLabel(PAUSED_LABEL)
              alreadyCheckedUrls[url] = 'pause'
            }
          }
      }
    }
  }
}
 
function cleanUrl(url) {
  if(WRAPPED_URLS) {
    url = url.substr(url.lastIndexOf('http'));
    if(decodeURIComponent(url) !== url) {
      url = decodeURIComponent(url);
    }
  }
  if(STRIP_QUERY_STRING) {
    if(url.indexOf('?')>=0) {
      url = url.split('?')[0];
    }
  }
  if(url.indexOf('{') >= 0) {
    //Let's remove the value track parameters
    url = url.replace(/\{[0-9a-zA-Z]+\}/g,'');
  }
  return url;
}
 
function getAvailabilityStrings(url) {
  var re = /\$|\w|\d/ //may need to be adjusted depending on site - used for cleaning availability values
  
  try {
  var response = UrlFetchApp.fetch(url).getContentText();
  } catch(e) {
    Logger.log('Url failed')
    return 'siteLoadError'
  }
  
  for (var m in DISCONTINUED_CHECK) {
    if (response.indexOf(DISCONTINUED_CHECK[m]) > -1) {
      //Logger.log('discontinued item ' + url)
      return 'discontinued'
    }
  }
  
  for (var i in CHECK_IDENTIFIERS) {
    if (response.indexOf(CHECK_IDENTIFIERS[i]) > 0) {
      response = response.slice(response.indexOf(CHECK_IDENTIFIERS[i]));
      
      //necessary for making sure we're only pulling from an actual element. not sure if it's the best way
      if (response.indexOf('<') > -1) {
        response = response.slice(response.indexOf('>'), response.indexOf('<'));
      } else {
        return 'valueError'
      }

      // data cleaning loops. may need to be adjusted depending on site
      // TBH might not even be necessary for this enable/pause script
      while (!re.test(response[0])) {
        response = response.substring(1);
      }
      while (!re.test(response[response.length-1])) {
        response = response.substring(0, response.length-1)
      }
      
      return response
      
    } else if (failedPages.indexOf(response) === -1){
        failedPages.push(url);
        return 'notFound'
    }  else {
      return 'notFound'
    }
  }
}

function buildSelector() {
  var selector = (URL_LEVEL === 'Ad') ? AdWordsApp.ads() : AdWordsApp.keywords();
   
  if(PRODUCT_PAGE_EXTENSION) {
    selector = selector.withCondition("CreativeFinalUrls CONTAINS '"+PRODUCT_PAGE_EXTENSION+"'")
  } 
  
  if(ONLY_ACTIVE) {
    selector = selector.withCondition('CampaignStatus = ENABLED');
    if(URL_LEVEL !== 'Ad') {
      selector = selector.withCondition('AdGroupStatus = ENABLED');
    }
  } else {
    selector = selector.withCondition('CampaignStatus != DELETED').withCondition('AdGroupStatus != DELETED')
  }
  
  selector = selector.withCondition("LabelNames CONTAINS_NONE ['" + CHECK_LABEL + "']")
  
  if(CAMPAIGN_LABEL) {
    if(AdWordsApp.labels().withCondition("Name = '"+CAMPAIGN_LABEL+"'").get().hasNext()) {
      var label = AdWordsApp.labels().withCondition("Name = '"+CAMPAIGN_LABEL+"'").get().next();
      var campIter = label.campaigns().get();
      var campaignNames = [];
      while(campIter.hasNext()) {
        campaignNames.push(campIter.next().getName());
      }
      selector = selector.withCondition("CampaignName IN ['"+campaignNames.join("','")+"']");
    } else {
      Logger.log('WARNING: Campaign label does not exist: '+CAMPAIGN_LABEL);
    }
  }
  return selector;
  
}
